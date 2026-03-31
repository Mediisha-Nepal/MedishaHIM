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

function buildConditionalCreateHeader(encounter) {
  const firstIdentifier = encounter?.identifier?.find(
    (identifier) => identifier?.system && identifier?.value,
  );

  if (!firstIdentifier) return undefined;
  return `identifier=${firstIdentifier.system}|${firstIdentifier.value}`;
}

export async function createEncounter({ baseUrl, timeoutMs }, encounter) {
  const ifNoneExist = buildConditionalCreateHeader(encounter);

  const response = await getClient({ baseUrl, timeoutMs }).post(
    '/Encounter',
    encounter,
    {
      headers: {
        Prefer: 'return=representation',
        ...(ifNoneExist ? { 'If-None-Exist': ifNoneExist } : {}),
      },
    },
  );

  return wrap(response);
}
