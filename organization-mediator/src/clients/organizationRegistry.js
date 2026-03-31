import axios from 'axios';
import { CONTENT_TYPES } from '../config/constants.js';

// ── Shared axios instance (connection keep-alive, common headers) ───────
let _client = null;

function getClient({ baseUrl, timeoutMs }) {
  if (!_client || _client.defaults.baseURL !== baseUrl) {
    _client = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: {
        'Content-Type': CONTENT_TYPES.FHIR_JSON,
        Accept: CONTENT_TYPES.FHIR_JSON,
      },
    });
  }
  return _client;
}

/**
 * Normalise every response to { status, data }.
 */
function wrap(response) {
  return { status: response.status, data: response.data };
}

export async function createOrganization(
  { baseUrl, timeoutMs },
  fhirOrganization,
  identifierValue,
  identifierSystem,
) {
  const res = await getClient({ baseUrl, timeoutMs }).post(
    '/Organization',
    fhirOrganization,
    {
      headers: {
        'If-None-Exist': `identifier=${identifierSystem}|${identifierValue}`,
      },
    },
  );
  return wrap(res);
}

export async function deleteOrganization(
  { baseUrl, timeoutMs },
  identifier,
  value,
) {
  // Search for the organization by identifier
  const res = await getClient({ baseUrl, timeoutMs }).get('/Organization', {
    params: { identifier: `${identifier}|${value}` },
  });
  console.log(res.data);
  if (!res.data.entry || res.data.entry.length === 0) {
    throw new Error('Organization not found');
  }
  const org = res.data.entry[0].resource;
  org.active = false;
  // Update the organization
  const updateRes = await getClient({ baseUrl, timeoutMs }).put(
    `/Organization/${org.id}`,
    org,
  );
  return wrap(updateRes);
}

export async function searchOrganization(
  { baseUrl, timeoutMs },
  identifier,
  value,
) {
  console.log(baseUrl);
  const res = await getClient({ baseUrl, timeoutMs }).get('/Organization', {
    params: {
      identifier: `${identifier}|${value}`,
    },
  });
  return wrap(res);
}
