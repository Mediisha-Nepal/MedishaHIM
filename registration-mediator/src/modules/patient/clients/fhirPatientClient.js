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

export async function readPatientById({ baseUrl, timeoutMs }, patientId) {
  const response = await getClient({ baseUrl, timeoutMs }).get(
    `/Patient/${patientId}`,
  );

  return wrap(response);
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

  const response = await getClient({ baseUrl, timeoutMs }).get('/Patient', {
    params,
  });

  return wrap(response);
}

export async function queryMdmLinks({ baseUrl, timeoutMs }, query = {}) {
  const params = { resourceType: 'Patient' };

  if (typeof query === 'string') {
    params.resourceId = query;
  } else {
    if (query?.resourceId) params.resourceId = query.resourceId;
    if (query?.goldenResourceId) params.goldenResourceId = query.goldenResourceId;
    if (query?.matchResult) params.matchResult = query.matchResult;
  }

  const response = await getClient({ baseUrl, timeoutMs }).get(
    '/$mdm-query-links',
    {
      params,
    },
  );

  return wrap(response);
}

export async function submitPatientToMdm({ baseUrl, timeoutMs }, patientId) {
  const response = await getClient({ baseUrl, timeoutMs }).post(
    `/Patient/${patientId}/$mdm-submit`,
    {
      resourceType: 'Parameters',
    },
  );

  return wrap(response);
}

function buildMdmParameters({ goldenResourceId, resourceId, matchResult }) {
  return {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'goldenResourceId',
        valueString: goldenResourceId,
      },
      {
        name: 'resourceId',
        valueString: resourceId,
      },
      ...(matchResult
        ? [
            {
              name: 'matchResult',
              valueString: matchResult,
            },
          ]
        : []),
    ],
  };
}

export async function createMdmLink(
  { baseUrl, timeoutMs },
  { goldenResourceId, resourceId, matchResult = 'MATCH' },
) {
  const response = await getClient({ baseUrl, timeoutMs }).post(
    '/$mdm-create-link',
    buildMdmParameters({ goldenResourceId, resourceId, matchResult }),
  );

  return wrap(response);
}

export async function updateMdmLink(
  { baseUrl, timeoutMs },
  { goldenResourceId, resourceId, matchResult = 'MATCH' },
) {
  const response = await getClient({ baseUrl, timeoutMs }).post(
    '/$mdm-update-link',
    buildMdmParameters({ goldenResourceId, resourceId, matchResult }),
  );

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
