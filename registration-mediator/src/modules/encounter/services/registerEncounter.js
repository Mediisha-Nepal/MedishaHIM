import { httpError } from '../../../utils/httpError.js';
import { buildSourceEncounterSystem } from '../../../utils/sourceSystem.js';
import { createEncounter } from '../clients/fhirEncounterClient.js';
import { toFhirEncounter } from '../mappers/toFhirEncounter.js';

export async function registerEncounter(
  { fhirConfig },
  encounterInput,
  { patientId, organizationId, encounterIdentifierSystem, sourceSystem },
) {
  const { subject: ignoredSubject, ...safeEncounterInput } = encounterInput || {};

  const fhirEncounter = toFhirEncounter({
    ...safeEncounterInput,
    patient_id: patientId,
    organization_id: organizationId,
    identifier_system:
      safeEncounterInput?.identifier_system ||
      encounterIdentifierSystem ||
      buildSourceEncounterSystem(sourceSystem),
  });
  console.log(fhirEncounter);
  if (!fhirEncounter.subject?.reference) {
    throw httpError(
      400,
      'Encounter subject could not be derived from the resolved patient registration.',
    );
  }

  const response = await createEncounter(
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
