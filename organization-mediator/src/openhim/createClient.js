// generate random password from the client ID and create client in the OpenHIM
import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

function sanitizeClientId(clientId) {
  return clientId.replace(/[^a-zA-Z0-9]/g, '');
}

function generatePlainPassword(clientId) {
  const id = sanitizeClientId(clientId).slice(0, 16) || 'client';
  const randomNum = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
  return `${id}-${randomNum}`;
}

async function generateClientPassword(clientId) {
  const passwordSalt = crypto.randomBytes(16);
  const password = generatePlainPassword(clientId);
  const shasum = crypto.createHash('sha256');
  shasum.update(password);
  shasum.update(passwordSalt.toString('hex'));
  const passwordHash = shasum.digest('hex');

  return { passwordSalt, passwordHash, plainPassword: password };
}

function buildAxiosOptions(openhimConfig) {
  return {
    auth: {
      username: openhimConfig.username,
      password: openhimConfig.password,
      roles: ['operator'],
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false, // Accept self-signed certificates
    }),
  };
}

function buildClientPayload({ clientId, name, password }) {
  return {
    clientID: clientId,
    passwordAlgorithm: 'sha256',
    passwordHash: password.passwordHash,
    passwordSalt: password.passwordSalt.toString('hex'),
    name: name || clientId,
    roles: ['operator'],
  };
}

function normalizeResponseData(data) {
  return typeof data === 'string' ? { message: data } : (data ?? {});
}

function normalizeClientsList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.clients)) return data.clients;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function extractErrorDetails(err) {
  const status = err?.response?.status;
  const payload = err?.response?.data;
  const payloadText = status
    ? typeof payload === 'string'
      ? payload
      : JSON.stringify(payload || {})
    : `${err?.code || 'ERR'}: ${err?.message || 'Unknown connection error'}`;
  return { status, payloadText };
}

function shouldTryExistingClientFallback(err) {
  const { status, payloadText } = extractErrorDetails(err);
  if (status === 409) return true;

  if (![400, 422, 500].includes(status)) return false;

  const text = String(payloadText || '').toLowerCase();
  return (
    text.includes('already exists') ||
    text.includes('duplicate') ||
    text.includes('exists')
  );
}

async function findClientByClientId({ openhimConfig, reqOptions, clientId }) {
  const listRes = await axios.get(`${openhimConfig.apiURL}/clients`, reqOptions);
  const clients = normalizeClientsList(listRes.data);
  return clients.find((client) => client?.clientID === clientId) || null;
}

async function updateExistingClientByClientId({
  openhimConfig,
  payload,
  clientId,
  reqOptions,
}) {
  const found = await findClientByClientId({
    openhimConfig,
    reqOptions,
    clientId,
  });
  const clientDocId = found?._id || found?.id;
  if (!clientDocId) {
    const err = new Error(`Client not found for clientID=${clientId}`);
    err.status = 404;
    throw err;
  }

  const updateUrl = `${openhimConfig.apiURL}/clients/${clientDocId}`;
  const updateRes = await axios.put(updateUrl, payload, reqOptions);
  return normalizeResponseData(updateRes.data);
}

export async function createClient({ openhimConfig }, data) {
  const { clientId, name } = data;
  const password = await generateClientPassword(clientId);
  const reqOptions = buildAxiosOptions(openhimConfig);
  const payload = buildClientPayload({ clientId, name, password });

  try {
    const existing = await findClientByClientId({
      openhimConfig,
      reqOptions,
      clientId,
    });

    if (existing) {
      const updateData = await updateExistingClientByClientId({
        openhimConfig,
        payload,
        clientId,
        reqOptions,
      });

      return {
        ...updateData,
        plainPassword: password.plainPassword,
        clientId,
        mode: 'updated',
      };
    }

    const res = await axios.post(
      `${openhimConfig.apiURL}/clients`,
      payload,
      reqOptions,
    );

    return {
      ...normalizeResponseData(res.data),
      plainPassword: password.plainPassword,
      clientId,
      mode: 'created',
    };
  } catch (err) {
    if (!shouldTryExistingClientFallback(err)) {
      const { status, payloadText } = extractErrorDetails(err);
      console.error(
        `Error creating client in OpenHIM (status=${status}):`,
        payloadText || err.message,
      );
      throw new Error(
        `Failed to create client in OpenHIM${status ? ` (status ${status})` : ''}`,
      );
    }

    try {
      const updateData = await updateExistingClientByClientId({
        openhimConfig,
        payload,
        clientId,
        reqOptions,
      });

      return {
        ...updateData,
        plainPassword: password.plainPassword,
        clientId,
        mode: 'updated',
      };
    } catch (updateErr) {
      const { status, payloadText } = extractErrorDetails(updateErr);
      console.error(
        `Error updating existing client in OpenHIM (status=${status}):`,
        payloadText || updateErr.message,
      );
      throw new Error(
        `Failed to update existing client in OpenHIM${status ? ` (status ${status})` : ''}`,
      );
    }
  }
}
