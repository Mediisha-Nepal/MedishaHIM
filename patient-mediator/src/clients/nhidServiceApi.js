import axios from 'axios';
import crypto from 'crypto';
import { CONTENT_TYPES } from '../config/constants.js';

let _client = null;

function getClient({ baseUrl, timeoutMs }) {
  if (!_client || _client.defaults.baseURL !== baseUrl) {
    _client = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: {
        'Content-Type': CONTENT_TYPES.JSON,
        Accept: CONTENT_TYPES.JSON,
      },
    });
  }
  return _client;
}

function wrap(response) {
  return { status: response.status, data: response.data };
}

function buildNhidIdempotencyKey(payload) {
  const keyMaterial = JSON.stringify({
    fhirId: payload?.fhirId || payload?.patientFhirId || '',
    sourceSystem: payload?.sourceSystem || '',
    sourceValue: payload?.sourceValue || payload?.sourcePatientId || '',
    nhid: payload?.nhid || '',
  });

  const digest = crypto.createHash('sha256').update(keyMaterial).digest('hex');

  return `pm-nhid-${digest}`;
}

export async function generateNhid({ baseUrl, timeoutMs }, payload) {
  const res = await getClient({ baseUrl, timeoutMs }).post('/nhids', payload, {
    headers: {
      'Idempotency-Key': buildNhidIdempotencyKey(payload),
    },
  });
  return wrap(res);
}
