import { httpError } from '../../../utils/httpError.js';
import { isObject, nonEmptyString } from '../../../utils/primitives.js';

function toPatientPayload(body) {
  const patient = isObject(body?.patient) ? { ...body.patient } : { ...body };

  patient.local_patient_id =
    patient.local_patient_id || nonEmptyString(body?.local_patient_id);
  patient.first_name = patient.first_name || nonEmptyString(body?.first_name);
  patient.last_name = patient.last_name || nonEmptyString(body?.last_name);

  // Backward-compatible normalization into the new Patient FHIR mapper shape.
  const mergedName = [patient.first_name, patient.last_name]
    .map((value) => nonEmptyString(value))
    .filter(Boolean)
    .join(' ')
    .trim();

  patient.HospitalNo =
    nonEmptyString(patient.HospitalNo) ||
    nonEmptyString(patient.hospital_no) ||
    nonEmptyString(patient.local_patient_id) ||
    nonEmptyString(body?.HospitalNo) ||
    nonEmptyString(body?.hospital_no) ||
    nonEmptyString(body?.local_patient_id);

  patient.Name =
    nonEmptyString(patient.Name) ||
    nonEmptyString(body?.Name) ||
    nonEmptyString(body?.full_name) ||
    mergedName ||
    undefined;

  patient.Sex =
    nonEmptyString(patient.Sex) ||
    nonEmptyString(patient.sex) ||
    nonEmptyString(body?.Sex) ||
    nonEmptyString(body?.sex);

  patient.DOB =
    nonEmptyString(patient.DOB) ||
    nonEmptyString(patient.dob) ||
    nonEmptyString(body?.DOB) ||
    nonEmptyString(body?.dob);

  patient.MobileNo =
    nonEmptyString(patient.MobileNo) ||
    nonEmptyString(patient.PhoneNo) ||
    nonEmptyString(patient.phone) ||
    nonEmptyString(body?.MobileNo) ||
    nonEmptyString(body?.phone);

  patient.Email =
    nonEmptyString(patient.Email) ||
    nonEmptyString(patient.email) ||
    nonEmptyString(body?.Email) ||
    nonEmptyString(body?.email);

  if (isObject(patient.address)) {
    if (!nonEmptyString(patient.Address)) {
      patient.Address =
        nonEmptyString(patient.address.text) ||
        nonEmptyString(patient.address.line?.[0]) ||
        undefined;
    }

    patient.nagarpalika =
      nonEmptyString(patient.nagarpalika) ||
      nonEmptyString(patient.address.city) ||
      undefined;
    patient.district =
      nonEmptyString(patient.district) ||
      nonEmptyString(patient.address.district) ||
      undefined;
    patient.province =
      nonEmptyString(patient.province) ||
      nonEmptyString(patient.address.state) ||
      undefined;
    patient.ward =
      nonEmptyString(patient.ward) ||
      nonEmptyString(patient.address.ward) ||
      undefined;
    patient.country =
      nonEmptyString(patient.country) ||
      nonEmptyString(patient.address.country) ||
      undefined;
  }

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
  const selectedPatientId =
    nonEmptyString(body?.selected_patient_id) ||
    nonEmptyString(body?.source_patient_id) ||
    nonEmptyString(body?.patient_id) ||
    nonEmptyString(body?.fhir_patient_id) ||
    nonEmptyString(body?.enterprise_patient_id) ||
    nonEmptyString(body?.patient?.selected_patient_id) ||
    nonEmptyString(body?.patient?.source_patient_id) ||
    nonEmptyString(body?.patient?.patient_id) ||
    nonEmptyString(body?.patient?.fhir_patient_id) ||
    nonEmptyString(body?.patient?.enterprise_patient_id);

  return {
    sourceSystem,
    patient,
    encounter,
    selectedPatientId,
    organizationLookup: toOrganizationLookup(
      body,
      defaults,
      authClientId,
    ),
    authClientId,
  };
}
