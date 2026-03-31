import { httpError } from '../../../utils/httpError.js';
import { isObject, nonEmptyString } from '../../../utils/primitives.js';

function toPatientPayload(body) {
  const patient = isObject(body?.patient) ? { ...body.patient } : { ...body };

  patient.local_patient_id =
    patient.local_patient_id || nonEmptyString(body?.local_patient_id);
  patient.patient_id =
    patient.patient_id ||
    nonEmptyString(body?.patient_id) ||
    nonEmptyString(body?.existing_patient_id);
  patient.first_name = patient.first_name || nonEmptyString(body?.first_name);
  patient.last_name = patient.last_name || nonEmptyString(body?.last_name);

  return patient;
}

function toEncounterPayload(body) {
  const encounter = isObject(body?.encounter) ? { ...body.encounter } : {};

  if (!encounter.encounter_id && body?.encounter_id) {
    encounter.encounter_id = body.encounter_id;
  }

  if (!encounter.encounter_class && body?.encounter_class) {
    encounter.encounter_class = body.encounter_class;
  }

  if (!encounter.reason_text && body?.reason_text) {
    encounter.reason_text = body.reason_text;
  }

  if (!encounter.encounter_start && body?.encounter_start) {
    encounter.encounter_start = body.encounter_start;
  }

  return encounter;
}

function toOrganizationLookup(body, defaults, authClientId) {
  const organization = isObject(body?.organization) ? body.organization : {};

  const providedValue = nonEmptyString(
    organization.value || body?.organization_value || body?.facility_id,
  );
  const value = authClientId;

  if (
    providedValue &&
    providedValue.toLowerCase() !== authClientId.toLowerCase()
  ) {
    throw httpError(
      403,
      'Provided organization identifier value does not match authenticated client.',
    );
  }

  const defaultSystem = nonEmptyString(defaults.organizationLookupIdentifierSystem);
  if (!defaultSystem) {
    throw httpError(500, 'Organization lookup identifier system is not configured.');
  }
  const system = defaultSystem;

  return { system, value };
}

export function parseRegisterPatientRequest(body, defaults, authContext = {}) {
  if (!isObject(body)) {
    throw httpError(400, 'Request body must be a JSON object.');
  }

  const authClientId = nonEmptyString(authContext.clientId);
  if (!authClientId) {
    throw httpError(
      401,
      'Authenticated clientId is required (x-openhim-clientid, x-client-id, or Basic auth username).',
    );
  }

  const requestedSourceSystem =
    nonEmptyString(body.source_system) ||
    nonEmptyString(body?.patient?.source_system);

  if (
    authClientId &&
    requestedSourceSystem &&
    requestedSourceSystem.toLowerCase() !== authClientId.toLowerCase()
  ) {
    throw httpError(
      403,
      'source_system does not match authenticated client identifier.',
    );
  }

  const sourceSystem = authClientId;

  const patient = toPatientPayload(body);
  const encounter = toEncounterPayload(body);

  return {
    sourceSystem,
    patient,
    encounter,
    organizationLookup: toOrganizationLookup(
      body,
      defaults,
      authClientId,
    ),
    authClientId,
  };
}
