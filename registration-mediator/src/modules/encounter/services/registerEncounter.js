import { httpError } from '../../../utils/httpError.js';
import { createEncounter } from '../clients/fhirEncounterClient.js';
import { toFhirEncounter } from '../mappers/toFhirEncounter.js';

function parsePatientReferenceId(value) {
  const raw =
    typeof value === 'object' && value?.reference ? value.reference : value;

  if (raw === null || raw === undefined) return null;

  const normalized = String(raw).trim();
  if (!normalized) return null;
  if (!normalized.includes('/')) return normalized;
  if (!normalized.startsWith('Patient/')) return null;

  return normalized.slice('Patient/'.length) || null;
}

export function resolveEncounterPatientId(encounterInput = {}) {
  return (
    parsePatientReferenceId(encounterInput.subject) ||
    parsePatientReferenceId(encounterInput.patient_id) ||
    parsePatientReferenceId(encounterInput.patientId)
  );
}

const defaultDeps = {
  createEncounter,
  toFhirEncounter,
};

export async function registerEncounter(
  { fhirConfig },
  encounterInput,
  { patientId, organizationId },
  deps = {},
) {
  const activeDeps = { ...defaultDeps, ...deps };
  const resolvedPatientId = String(patientId);
  const requestedPatientId = resolveEncounterPatientId(encounterInput);

  if (requestedPatientId && requestedPatientId !== resolvedPatientId) {
    throw httpError(
      409,
      `Encounter subject Patient/${requestedPatientId} does not match resolved patient Patient/${resolvedPatientId}.`,
    );
  }

  const fhirEncounter = activeDeps.toFhirEncounter({
    ...encounterInput,
    patient_id: resolvedPatientId,
    subject: { reference: `Patient/${resolvedPatientId}` },
    organization_id: organizationId,
  });

  if (!fhirEncounter.subject?.reference) {
    throw httpError(
      400,
      'Encounter subject is required (provide patient_id or subject reference).',
    );
  }

  const response = await activeDeps.createEncounter(
    {
      baseUrl: fhirConfig.baseUrl,
      timeoutMs: fhirConfig.timeoutMs,
    },
    fhirEncounter,
  );

  return {
    status: response.status,
    action: response.status === 201 ? 'created' : 'existing',
    resource: response.data,
  };
}
