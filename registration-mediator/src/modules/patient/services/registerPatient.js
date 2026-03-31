import { firstResourceFromBundle } from '../../../utils/bundle.js';
import { httpError } from '../../../utils/httpError.js';
import {
  createPatientConditionally,
  readPatientById,
  searchPatientByIdentifier,
  updatePatient,
} from '../clients/fhirPatientClient.js';
import { toFhirPatient } from '../mappers/toFhirPatient.js';
import { validatePatientInput } from '../validators/validatePatientInput.js';

function hasIdentifier(patient, system, value) {
  return (patient.identifier || []).some(
    (identifier) => identifier.system === system && identifier.value === value,
  );
}

function appendMissingIdentifiers(patient, identifiers) {
  const next = {
    ...patient,
    identifier: [...(patient.identifier || [])],
  };

  let changed = false;

  for (const identifier of identifiers || []) {
    if (!identifier?.system || !identifier?.value) continue;
    if (!hasIdentifier(next, identifier.system, identifier.value)) {
      next.identifier.push(identifier);
      changed = true;
    }
  }

  return { patient: next, changed };
}

function syncManagingOrganization(patient, desiredReference) {
  const currentReference = patient?.managingOrganization?.reference;
  if (currentReference === desiredReference) {
    return { patient, changed: false };
  }

  return {
    patient: {
      ...patient,
      managingOrganization: { reference: desiredReference },
    },
    changed: true,
  };
}

export function parsePatientReferenceId(reference) {
  const raw =
    typeof reference === 'object' && reference?.reference
      ? reference.reference
      : reference;

  if (!raw || typeof raw !== 'string') return null;

  const normalized = raw.trim();
  if (!normalized) return null;
  if (!normalized.includes('/')) return normalized;
  if (!normalized.startsWith('Patient/')) return null;

  return normalized.slice('Patient/'.length) || null;
}

async function fetchPatientByPrimaryIdentifier(fhirConfig, identifier, deps) {
  const response = await deps.searchPatientByIdentifier(
    {
      baseUrl: fhirConfig.baseUrl,
      timeoutMs: fhirConfig.timeoutMs,
    },
    identifier,
  );

  return firstResourceFromBundle(response.data, 'Patient');
}

async function fetchPatientById(fhirConfig, id, deps) {
  try {
    const response = await deps.readPatientById(
      {
        baseUrl: fhirConfig.baseUrl,
        timeoutMs: fhirConfig.timeoutMs,
      },
      id,
    );

    return response.data || null;
  } catch (error) {
    if (error?.response?.status === 404) {
      return null;
    }

    throw error;
  }
}

const defaultDeps = {
  createPatientConditionally,
  readPatientById,
  searchPatientByIdentifier,
  toFhirPatient,
  updatePatient,
  validatePatientInput,
};

export async function registerPatient(
  { fhirConfig },
  patientInput,
  options,
  deps = {},
) {
  const activeDeps = { ...defaultDeps, ...deps };

  const validation = activeDeps.validatePatientInput(patientInput);
  if (!validation.ok) {
    throw httpError(400, validation.message);
  }

  const sourceIdentifierSystem = options.patientIdentifierSystem;
  if (!sourceIdentifierSystem) {
    throw httpError(
      422,
      'Organization is missing MRN identifier system (identifier with type "Hospital MRN").',
    );
  }

  const fhirPatient = activeDeps.toFhirPatient({
    ...patientInput,
    identifier_system: sourceIdentifierSystem,
    organization_id: options.organizationId,
  });

  const primaryIdentifier = fhirPatient.identifier?.[0];
  if (!primaryIdentifier?.system || !primaryIdentifier?.value) {
    throw httpError(
      400,
      'Patient identifier configuration is invalid (system/value missing).',
    );
  }

  const desiredOrgRef = `Organization/${options.organizationId}`;
  const explicitPatientId = parsePatientReferenceId(
    options.existingPatientReference || options.existingPatientId,
  );
  let resource = explicitPatientId
    ? await fetchPatientById(fhirConfig, explicitPatientId, activeDeps)
    : null;

  if (explicitPatientId && !resource) {
    throw httpError(404, `Patient/${explicitPatientId} was not found.`);
  }

  const identifierMatch = await fetchPatientByPrimaryIdentifier(
    fhirConfig,
    {
      system: primaryIdentifier.system,
      value: primaryIdentifier.value,
    },
    activeDeps,
  );

  if (resource && identifierMatch && resource.id !== identifierMatch.id) {
    throw httpError(
      409,
      `Patient/${resource.id} conflicts with existing patient Patient/${identifierMatch.id} for identifier ${primaryIdentifier.system}|${primaryIdentifier.value}.`,
    );
  }

  if (!resource) {
    resource = identifierMatch;
  }

  let action = resource ? 'existing' : 'created';
  let status = resource ? 200 : 201;

  if (!resource) {
    const createResponse = await activeDeps.createPatientConditionally(
      {
        baseUrl: fhirConfig.baseUrl,
        timeoutMs: fhirConfig.timeoutMs,
      },
      fhirPatient,
      {
        system: primaryIdentifier.system,
        value: primaryIdentifier.value,
      },
    );

    resource = createResponse.data;
    status = createResponse.status;
    action = createResponse.status === 201 ? 'created' : 'existing';

    if (!resource?.id) {
      resource = await fetchPatientByPrimaryIdentifier(
        fhirConfig,
        {
          system: primaryIdentifier.system,
          value: primaryIdentifier.value,
        },
        activeDeps,
      );
    }

    if (!resource?.id) {
      throw httpError(502, 'Unable to resolve patient after create request.');
    }
  }

  const idMerge = appendMissingIdentifiers(resource, fhirPatient.identifier);
  const orgMerge = syncManagingOrganization(idMerge.patient, desiredOrgRef);

  if (idMerge.changed || orgMerge.changed) {
    const updateResponse = await activeDeps.updatePatient(
      {
        baseUrl: fhirConfig.baseUrl,
        timeoutMs: fhirConfig.timeoutMs,
      },
      orgMerge.patient,
    );

    resource = updateResponse.data;
    status = updateResponse.status;
    if (action !== 'created') {
      action = 'updated';
    }
  }

  return {
    status,
    action,
    resource,
    identifierSystem: sourceIdentifierSystem,
  };
}
