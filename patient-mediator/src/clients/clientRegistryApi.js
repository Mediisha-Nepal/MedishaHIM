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

// ── Patient CRUD ────────────────────────────────────────────────────────

export async function readPatientById({ baseUrl, timeoutMs }, id) {
  const res = await getClient({ baseUrl, timeoutMs }).get(`/Patient/${id}`);
  return wrap(res);
}

export async function updatePatient({ baseUrl, timeoutMs }, id, fhirPatient) {
  const res = await getClient({ baseUrl, timeoutMs }).put(
    `/Patient/${id}`,
    fhirPatient,
  );
  return wrap(res);
}

// ── Patient Search ──────────────────────────────────────────────────────

export async function searchPatientByIdentifier(
  { baseUrl, timeoutMs },
  { system, value },
) {
  const res = await getClient({ baseUrl, timeoutMs }).get('/Patient', {
    params: { identifier: `${system}|${value}` },
  });
  return wrap(res);
}

export async function searchPatientByDemographics(
  { baseUrl, timeoutMs },
  { family, given, birthDate, gender, phone },
) {
  const params = {};
  if (family) params.family = family;
  if (given) params.given = given;
  if (birthDate) params.birthdate = birthDate;
  if (gender) params.gender = gender;
  if (phone) params.telecom = phone;

  const res = await getClient({ baseUrl, timeoutMs }).get('/Patient', {
    params,
  });
  return wrap(res);
}

export async function searchEncountersByPatient(
  { baseUrl, timeoutMs },
  patientId,
) {
  const res = await getClient({ baseUrl, timeoutMs }).get('/Encounter', {
    params: {
      subject: `Patient/${patientId}`,
      _count: 200,
    },
  });
  return wrap(res);
}

export async function readOrganizationById({ baseUrl, timeoutMs }, id) {
  const res = await getClient({ baseUrl, timeoutMs }).get(`/Organization/${id}`);
  return wrap(res);
}

// ── MDM Links ───────────────────────────────────────────────────────────

export async function queryMdmLinks({ baseUrl, timeoutMs }, query = {}) {
  const params = { resourceType: 'Patient' };

  if (typeof query === 'string') {
    params.resourceId = query;
  } else {
    if (query?.resourceId) params.resourceId = query.resourceId;
    if (query?.goldenResourceId) params.goldenResourceId = query.goldenResourceId;
    if (query?.matchResult) params.matchResult = query.matchResult;
  }

  const res = await getClient({ baseUrl, timeoutMs }).get('/$mdm-query-links', {
    params,
  });
  return wrap(res);
}

export async function submitBatch({ baseURL, timeoutMs }, bundle) {
  const res = await getClient({ baseUrl: baseURL, timeoutMs }).post(
    '/',
    bundle,
  );
  return wrap(res);
}
