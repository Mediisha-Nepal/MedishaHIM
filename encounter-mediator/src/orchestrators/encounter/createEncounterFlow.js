import { toFhirEncounter } from '../../mappers/fhir/encounter.js';
import { createEncounter } from '../../clients/encounterRegistryApi.js';

export async function createEncounterFlow({ fhirConfig }, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const err = new Error('Encounter request body must be a JSON object');
    err.status = 400;
    throw err;
  }

  const fhirEncounter = toFhirEncounter(input);
  if (!fhirEncounter.subject?.reference) {
    const err = new Error(
      'Encounter subject is required (provide patient_id or subject reference).',
    );
    err.status = 400;
    throw err;
  }

  const response = await createEncounter(
    {
      baseUrl: fhirConfig.baseURL,
      timeoutMs: fhirConfig.timeoutMs,
    },
    fhirEncounter,
  );

  return {
    status: response.status,
    data: {
      action: response.status === 201 ? 'created' : 'existing',
      encounter: response.data,
    },
  };
}
