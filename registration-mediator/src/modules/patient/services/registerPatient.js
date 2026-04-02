import { firstResourceFromBundle } from '../../../utils/bundle.js';
import { httpError } from '../../../utils/httpError.js';
import {
  createMdmLink,
  createPatientConditionally,
  queryMdmLinks,
  readPatientById,
  searchPatientByDemographics,
  searchPatientByIdentifier,
  submitPatientToMdm,
  updateMdmLink,
  updatePatient,
} from '../clients/fhirPatientClient.js';
import { toFhirPatient } from '../mappers/toFhirPatient.js';
import {
  conflictingDemographicFields,
  findExactDemographicMatches,
  hasExactMatchDemographics,
  toPatientDemographics,
} from '../utils/demographics.js';
import {
  firstMatchGoldenPatientId,
  isGoldenPatient,
  mdmLinksFromParameters,
} from '../utils/mdm.js';
import { validatePatientInput } from '../validators/validatePatientInput.js';

function alignManagingOrganization(patient, desiredReference) {
  const currentReference = patient?.managingOrganization?.reference;
  if (currentReference === desiredReference) {
    return { patient, changed: false, conflict: false };
  }

  if (currentReference && currentReference !== desiredReference) {
    return {
      patient,
      changed: false,
      conflict: true,
    };
  }

  return {
    patient: {
      ...patient,
      managingOrganization: { reference: desiredReference },
    },
    changed: true,
    conflict: false,
  };
}

function patientClientOptions(fhirConfig) {
  return {
    baseUrl: fhirConfig.baseUrl,
    timeoutMs: fhirConfig.timeoutMs,
  };
}

function parsePatientReferenceId(reference) {
  const raw =
    typeof reference === 'object' && reference?.reference
      ? reference.reference
      : reference;

  if (raw === undefined || raw === null) return null;

  const normalized = String(raw).trim();
  if (!normalized) return null;
  if (!normalized.includes('/')) return normalized;
  if (!normalized.startsWith('Patient/')) return null;

  return normalized.slice('Patient/'.length) || null;
}

async function fetchPatientByPrimaryIdentifier(fhirConfig, identifier) {
  const response = await searchPatientByIdentifier(
    patientClientOptions(fhirConfig),
    identifier,
  );

  return firstResourceFromBundle(response.data, 'Patient');
}

function preferredDemographicMatch(patients) {
  if (!Array.isArray(patients) || patients.length === 0) return null;

  return [...patients].sort((a, b) => {
    const aUpdated = Date.parse(a?.meta?.lastUpdated || '') || 0;
    const bUpdated = Date.parse(b?.meta?.lastUpdated || '') || 0;

    if (aUpdated !== bUpdated) return bUpdated - aUpdated;

    const aId = String(a?.id || '');
    const bId = String(b?.id || '');
    return aId.localeCompare(bId);
  })[0];
}

async function fetchSameHospitalPatientByExactDemographics(
  fhirConfig,
  demographics,
  organizationReference,
) {
  if (!hasExactMatchDemographics(demographics)) return null;

  const response = await searchPatientByDemographics(
    patientClientOptions(fhirConfig),
    demographics,
  );

  const exactMatches = findExactDemographicMatches(response.data, demographics).filter(
    (patient) => patient?.managingOrganization?.reference === organizationReference,
  );

  return preferredDemographicMatch(exactMatches);
}

async function fetchPatientById(fhirConfig, patientId) {
  try {
    const response = await readPatientById(
      patientClientOptions(fhirConfig),
      patientId,
    );

    return response.data || null;
  } catch (error) {
    if (error?.response?.status === 404) {
      return null;
    }

    throw error;
  }
}

async function fetchMdmLinks(fhirConfig, query) {
  const response = await queryMdmLinks(patientClientOptions(fhirConfig), query);
  return mdmLinksFromParameters(response.data);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForGoldenPatientId(
  fhirConfig,
  patientId,
  { attempts = 3, delayMs = 250 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const goldenPatientId = firstMatchGoldenPatientId(
      await fetchMdmLinks(fhirConfig, {
        resourceId: patientId,
      }),
    );

    if (goldenPatientId) {
      return goldenPatientId;
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}

async function waitForGoldenPatientContext(
  fhirConfig,
  patientId,
  { attempts = 3, delayMs = 250 } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const goldenPatientId = firstMatchGoldenPatientId(
      await fetchMdmLinks(fhirConfig, {
        resourceId: patientId,
      }),
    );

    if (goldenPatientId) {
      return {
        goldenPatientId,
        matchResult: 'MATCH',
      };
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return {
    goldenPatientId: null,
    matchResult: null,
  };
}

async function resolveGoldenPatientContext(fhirConfig, patient) {
  if (!patient?.id) return null;
  if (isGoldenPatient(patient)) {
    return {
      goldenPatientId: patient.id,
      matchResult: 'MATCH',
    };
  }

  let goldenPatientId = firstMatchGoldenPatientId(
    await fetchMdmLinks(fhirConfig, {
      resourceId: patient.id,
    }),
  );
  if (goldenPatientId) {
    return {
      goldenPatientId,
      matchResult: 'MATCH',
    };
  }

  await submitPatientToMdm(patientClientOptions(fhirConfig), patient.id);

  const goldenLink = await waitForGoldenPatientContext(fhirConfig, patient.id);
  if (goldenLink?.goldenPatientId) return goldenLink;

  goldenPatientId = await waitForGoldenPatientId(fhirConfig, patient.id);
  return {
    goldenPatientId,
    matchResult: goldenPatientId ? 'MATCH' : null,
  };
}

function validateSelectedPatientDemographics(selectedPatient, requestedPatient) {
  const conflicts = conflictingDemographicFields(
    toPatientDemographics(selectedPatient),
    toPatientDemographics(requestedPatient),
  );

  if (conflicts.length > 0) {
    throw httpError(
      409,
      `Selected patient demographics conflict with the registration payload for: ${conflicts.join(', ')}.`,
    );
  }
}

async function ensureEnterpriseMatchLink(
  fhirConfig,
  { goldenPatientId, sourcePatientId },
) {
  const payload = {
    goldenResourceId: `Patient/${goldenPatientId}`,
    resourceId: `Patient/${sourcePatientId}`,
    matchResult: 'MATCH',
  };

  try {
    await createMdmLink(patientClientOptions(fhirConfig), payload);
  } catch (error) {
    const status = error?.response?.status;
    if (!status || ![400, 409, 422].includes(status)) {
      throw error;
    }

    await updateMdmLink(patientClientOptions(fhirConfig), payload);
  }
}

function uniquePatientIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

export async function registerPatient({ fhirConfig }, patientInput, options) {
  const validation = validatePatientInput(patientInput);
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

  const fhirPatient = toFhirPatient({
    ...patientInput,
    identifier_system: sourceIdentifierSystem,
    organization_id: options.organizationId,
  });
  const selectedPatientId = parsePatientReferenceId(options.selectedPatientId);
  if (options.selectedPatientId && !selectedPatientId) {
    throw httpError(
      400,
      'selected patient id must be a Patient id or Patient/{id} reference.',
    );
  }

  const primaryIdentifier = fhirPatient.identifier?.[0];
  if (!primaryIdentifier?.system || !primaryIdentifier?.value) {
    throw httpError(
      400,
      'Patient identifier configuration is invalid (system/value missing).',
    );
  }

  let selectedPatient = null;
  let selectedGoldenPatientId = null;
  if (selectedPatientId) {
    selectedPatient = await fetchPatientById(fhirConfig, selectedPatientId);
    if (!selectedPatient?.id) {
      throw httpError(404, `Patient/${selectedPatientId} was not found.`);
    }

    validateSelectedPatientDemographics(selectedPatient, fhirPatient);
    const selectedGoldenContext = await resolveGoldenPatientContext(
      fhirConfig,
      selectedPatient,
    );
    selectedGoldenPatientId = selectedGoldenContext?.goldenPatientId || null;
  }

  const desiredOrgRef = `Organization/${options.organizationId}`;
  let resource = await fetchPatientByPrimaryIdentifier(fhirConfig, {
    system: primaryIdentifier.system,
    value: primaryIdentifier.value,
  });

  if (selectedPatientId && resource?.id !== selectedPatientId && !selectedGoldenPatientId) {
    throw httpError(
      409,
      `Selected Patient/${selectedPatientId} is not linked to a golden patient yet. Confirm a candidate that already has an MDM link, or wait for MDM processing before retrying.`,
    );
  }

  let action = 'existing';
  let status = 200;

  if (!resource) {
    const sameHospitalDemographicMatch =
      await fetchSameHospitalPatientByExactDemographics(
        fhirConfig,
        toPatientDemographics(fhirPatient),
        desiredOrgRef,
      );

    if (sameHospitalDemographicMatch?.id) {
      return {
        status: 200,
        action: 'same_hospital_existing',
        resource: sameHospitalDemographicMatch,
        identifierSystem: sourceIdentifierSystem,
      };
    }

    const createResponse = await createPatientConditionally(
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
      resource = await fetchPatientByPrimaryIdentifier(fhirConfig, {
        system: primaryIdentifier.system,
        value: primaryIdentifier.value,
      });
    }

    if (!resource?.id) {
      throw httpError(502, 'Unable to resolve patient after create request.');
    }
  }

  const orgAlignment = alignManagingOrganization(resource, desiredOrgRef);
  if (orgAlignment.conflict) {
    throw httpError(
      409,
      `Patient/${resource.id} is already managed by ${resource.managingOrganization.reference} and cannot be reassigned to ${desiredOrgRef}.`,
    );
  }

  if (orgAlignment.changed) {
    const updateResponse = await updatePatient(
      {
        baseUrl: fhirConfig.baseUrl,
        timeoutMs: fhirConfig.timeoutMs,
      },
      orgAlignment.patient,
    );

    resource = updateResponse.data;
    status = updateResponse.status;
    if (action !== 'created') {
      action = 'updated';
    }
  }

  if (resource?.id) {
    await submitPatientToMdm(patientClientOptions(fhirConfig), resource.id);
  }

  if (selectedGoldenPatientId && resource?.id) {
    const sourcePatientsToLink = uniquePatientIds([
      resource.id,
      !isGoldenPatient(selectedPatient) ? selectedPatient?.id : null,
    ]);

    for (const sourcePatientId of sourcePatientsToLink) {
      await ensureEnterpriseMatchLink(fhirConfig, {
        goldenPatientId: selectedGoldenPatientId,
        sourcePatientId,
      });
    }
  }

  return {
    status,
    action,
    resource,
    identifierSystem: sourceIdentifierSystem,
  };
}
