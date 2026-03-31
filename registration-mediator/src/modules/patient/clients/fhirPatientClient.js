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

export async function searchPatientByIdentifier(
  { baseUrl, timeoutMs },
  { system, value },
) {
  const response = await getClient({ baseUrl, timeoutMs }).get('/Patient', {
    params: {
      identifier: `${system}|${value}`,
    },
  });

  return wrap(response);
}

export async function readPatientById({ baseUrl, timeoutMs }, id) {
  const response = await getClient({ baseUrl, timeoutMs }).get(`/Patient/${id}`);
  return wrap(response);
}

export async function createPatientConditionally(
  { baseUrl, timeoutMs },
  fhirPatient,
  { system, value },
) {
  const response = await getClient({ baseUrl, timeoutMs }).post(
    '/Patient',
    fhirPatient,
    {
      headers: {
        'If-None-Exist': `identifier=${system}|${value}`,
        Prefer: 'return=representation',
      },
    },
  );

  return wrap(response);
}

export async function updatePatient({ baseUrl, timeoutMs }, patient) {
  const response = await getClient({ baseUrl, timeoutMs }).put(
    `/Patient/${patient.id}`,
    patient,
    {
      headers: {
        Prefer: 'return=representation',
      },
    },
  );

  return wrap(response);
}
