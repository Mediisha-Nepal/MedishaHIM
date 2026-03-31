import axios from 'axios';
import { CONTENT_TYPES } from '../../../config/constants.js';

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

function wrap(response) {
  return { status: response.status, data: response.data };
}

export async function searchOrganizationByIdentifier(
  { baseUrl, timeoutMs },
  { system, value },
) {
  const response = await getClient({ baseUrl, timeoutMs }).get('/Organization', {
    params: {
      identifier: `${system}|${value}`,
    },
  });

  return wrap(response);
}
