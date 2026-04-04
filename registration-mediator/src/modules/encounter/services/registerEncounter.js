import { httpError } from '../../../utils/httpError.js';
import { firstResourceFromBundle } from '../../../utils/bundle.js';
import { nonEmptyString } from '../../../utils/primitives.js';
import { buildSourceEncounterSystem } from '../../../utils/sourceSystem.js';
import {
  createEncounter,
  searchEncounterByIdentifier,
} from '../clients/fhirEncounterClient.js';
import { toFhirEncounter } from '../mappers/toFhirEncounter.js';

function firstEncounterIdentifier(encounter) {
  const identifiers = Array.isArray(encounter?.identifier) ? encounter.identifier : [];
  const match = identifiers.find(
    (identifier) =>
      nonEmptyString(identifier?.system) && nonEmptyString(identifier?.value),
  );

  if (!match) return null;

  return {
    system: nonEmptyString(match.system),
    value: nonEmptyString(match.value),
  };
}

function resolveEncounterLookupIdentifier(
  encounterInput,
  { encounterIdentifierSystem, sourceSystem },
) {
  const directIdentifier = firstEncounterIdentifier(encounterInput);
  if (directIdentifier) return directIdentifier;

  const value = nonEmptyString(
    encounterInput?.encounter_id ||
      encounterInput?.encounter_number ||
      encounterInput?.local_encounter_id ||
      encounterInput?.id,
  );
  if (!value) return null;

  const system =
    nonEmptyString(encounterInput?.identifier_system) ||
    nonEmptyString(encounterIdentifierSystem) ||
    buildSourceEncounterSystem(sourceSystem);

  return { system, value };
}

export async function findExistingEncounterByIdentifier(
  { fhirConfig },
  encounterInput,
  { encounterIdentifierSystem, sourceSystem },
) {
  const identifier = resolveEncounterLookupIdentifier(encounterInput, {
    encounterIdentifierSystem,
    sourceSystem,
  });

  if (!identifier) return null;

  const response = await searchEncounterByIdentifier(
    {
      baseUrl: fhirConfig.baseUrl,
      timeoutMs: fhirConfig.timeoutMs,
    },
    identifier,
  );

  return firstResourceFromBundle(response.data, 'Encounter');
}

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

  if (!fhirEncounter.subject?.reference) {
    throw httpError(
      400,
      'Encounter subject could not be derived from the resolved patient registration.',
    );
  }

  const lookupIdentifier =
    firstEncounterIdentifier(fhirEncounter) ||
    resolveEncounterLookupIdentifier(safeEncounterInput, {
      encounterIdentifierSystem,
      sourceSystem,
    });

  let response;
  try {
    response = await createEncounter(
      {
        baseUrl: fhirConfig.baseUrl,
        timeoutMs: fhirConfig.timeoutMs,
      },
      fhirEncounter,
    );
  } catch (error) {
    const status = error?.response?.status;
    const isDuplicateEncounterIdentifier =
      status === 409 || status === 412 || status === 422;

    if (!isDuplicateEncounterIdentifier || !lookupIdentifier) {
      throw error;
    }

    const existingResponse = await searchEncounterByIdentifier(
      {
        baseUrl: fhirConfig.baseUrl,
        timeoutMs: fhirConfig.timeoutMs,
      },
      lookupIdentifier,
    );
    const existingEncounter = firstResourceFromBundle(
      existingResponse.data,
      'Encounter',
    );

    if (!existingEncounter?.id) {
      throw error;
    }

    return {
      status: 200,
      action: 'existing',
      resource: existingEncounter,
    };
  }

  return {
    status: response.status,
    action: response.status === 201 ? 'created' : 'existing',
    resource: response.data,
  };
}
