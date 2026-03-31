import { resolveOrganization } from '../../organization/services/resolveOrganization.js';
import { registerPatient } from '../../patient/services/registerPatient.js';
import { registerEncounter } from '../../encounter/services/registerEncounter.js';
import { parseRegisterPatientRequest } from '../parsers/registerPatientRequest.js';

function toFullUrl(fhirBaseUrl, resource) {
  if (!resource?.resourceType || !resource?.id) return undefined;
  const base = String(fhirBaseUrl || '').replace(/\/$/, '');
  return `${base}/${resource.resourceType}/${resource.id}`;
}

function buildRegistrationBundle({ fhirBaseUrl, patient, encounter }) {
  const resources = [patient, encounter];
  const entries = resources.map((resource) => ({
    fullUrl: toFullUrl(fhirBaseUrl, resource),
    resource,
  }));

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: entries.length,
    entry: entries,
  };
}

function resolveExistingPatientReference(parsed) {
  return (
    parsed?.encounter?.subject?.reference ||
    parsed?.encounter?.subject ||
    parsed?.encounter?.patient_id ||
    parsed?.encounter?.patientId ||
    parsed?.patient?.patient_id ||
    parsed?.patient?.id ||
    null
  );
}

export async function registerPatientWorkflow(
  { fhirConfig, registrationConfig, authContext },
  requestBody,
) {
  const parsed = parseRegisterPatientRequest(
    requestBody,
    {
      defaultSourceSystem: registrationConfig.defaultSourceSystem,
      organizationLookupIdentifierSystem:
        registrationConfig.organizationLookupIdentifierSystem,
    },
    authContext,
  );

  const organization = await resolveOrganization({ fhirConfig }, parsed.organizationLookup);

  const patient = await registerPatient(
    { fhirConfig },
    parsed.patient,
    {
      sourceSystem: parsed.sourceSystem,
      organizationId: organization.resource.id,
      patientIdentifierSystem: organization.patientIdentifierSystem,
      existingPatientReference: resolveExistingPatientReference(parsed),
    },
  );

  const encounter = await registerEncounter(
    { fhirConfig },
    parsed.encounter,
    {
      patientId: patient.resource.id,
      organizationId: organization.resource.id,
    },
  );

  const overallStatus =
    patient.action === 'created' || encounter.action === 'created' ? 201 : 200;

  const bundle = buildRegistrationBundle({
    fhirBaseUrl: fhirConfig.baseUrl,
    patient: patient.resource,
    encounter: encounter.resource,
  });

  return {
    status: overallStatus,
    data: bundle,
  };
}
