import { firstResourceFromBundle } from '../../../utils/bundle.js';
import { httpError } from '../../../utils/httpError.js';
import { nonEmptyString } from '../../../utils/primitives.js';
import {
  createMdmLink,
  createPatient,
  createPatientConditionally,
  queryMdmLinks,
  readPatientById,
  searchPatientByIdentifier,
  submitPatientToMdm,
  updateMdmLink,
  updatePatient,
} from '../clients/fhirPatientClient.js';
import { toFhirPatient } from '../mappers/toFhirPatient.js';
import {
  conflictingDemographicFields,
  toPatientDemographics,
} from '../utils/demographics.js';
import {
  firstMatchGoldenPatientId,
  isGoldenPatient,
  mdmLinksFromParameters,
} from '../utils/mdm.js';
import { validatePatientInput } from '../validators/validatePatientInput.js';

const ENTERPRISE_IDENTIFIER_SYSTEM =
  'https://registry.example.org/id/patient/golden';

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
      { resourceId: patientId },
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
      { resourceId: patientId },
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
    { resourceId: patient.id },
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

function withEnterpriseIdentifier(patient, enterprisePatientId) {
  const enterpriseId = nonEmptyString(enterprisePatientId);
  if (!enterpriseId) return { patient, changed: false };

  const identifiers = Array.isArray(patient?.identifier) ? [...patient.identifier] : [];
  const existingIndex = identifiers.findIndex(
    (identifier) =>
      nonEmptyString(identifier?.system) === ENTERPRISE_IDENTIFIER_SYSTEM,
  );

  if (existingIndex >= 0) {
    if (nonEmptyString(identifiers[existingIndex]?.value) === enterpriseId) {
      return { patient, changed: false };
    }

    identifiers[existingIndex] = {
      ...identifiers[existingIndex],
      value: enterpriseId,
      type: { text: 'Enterprise Patient ID' },
    };
  } else {
    identifiers.push({
      system: ENTERPRISE_IDENTIFIER_SYSTEM,
      value: enterpriseId,
      type: { text: 'Enterprise Patient ID' },
    });
  }

  return {
    patient: {
      ...patient,
      identifier: identifiers,
    },
    changed: true,
  };
}

function firstTelecomValue(patient, system) {
  const telecom = Array.isArray(patient?.telecom) ? patient.telecom : [];
  const match = telecom.find((item) => item?.system === system && item?.value);
  return match?.value || null;
}

function firstPatientNameText(patient) {
  const names = Array.isArray(patient?.name) ? patient.name : [];
  const firstName = names[0] || null;
  if (!firstName) return null;
  if (firstName.text) return firstName.text;

  const given = Array.isArray(firstName.given) ? firstName.given.join(' ') : '';
  const family = firstName.family || '';
  const combined = `${given} ${family}`.trim();
  return combined || null;
}

function hydratePatientInputFromSelectedPatient(patientInput, selectedPatient) {
  if (!selectedPatient) return patientInput;

  return {
    ...patientInput,
    Name: patientInput?.Name || firstPatientNameText(selectedPatient),
    Sex: patientInput?.Sex || selectedPatient?.gender || patientInput?.sex,
    DOB: patientInput?.DOB || selectedPatient?.birthDate || patientInput?.dob,
    MobileNo:
      patientInput?.MobileNo ||
      patientInput?.PhoneNo ||
      firstTelecomValue(selectedPatient, 'phone'),
    Email: patientInput?.Email || firstTelecomValue(selectedPatient, 'email'),
  };
}

export async function registerPatient({ fhirConfig }, patientInput, options) {
  const sourceIdentifierSystem = options.patientIdentifierSystem;
  if (!sourceIdentifierSystem) {
    throw httpError(
      422,
      'Organization is missing MRN identifier system (identifier with type "Hospital MRN").',
    );
  }

  const selectedPatientId = parsePatientReferenceId(options.selectedPatientId);
  if (options.selectedPatientId && !selectedPatientId) {
    throw httpError(
      400,
      'selected patient id must be a Patient id or Patient/{id} reference.',
    );
  }

  let selectedPatient = null;
  let selectedGoldenPatientId = null;
  if (selectedPatientId) {
    selectedPatient = await fetchPatientById(fhirConfig, selectedPatientId);
    if (!selectedPatient?.id) {
      throw httpError(404, `Patient/${selectedPatientId} was not found.`);
    }
  }

  const effectivePatientInput = hydratePatientInputFromSelectedPatient(
    patientInput,
    selectedPatient,
  );
  const providedLocalPatientId = nonEmptyString(
    effectivePatientInput?.local_patient_id,
  );
  const validation = validatePatientInput(effectivePatientInput, {
    allowMissingName: Boolean(selectedPatientId),
    allowMissingIdentifier: true,
  });
  if (!validation.ok) {
    throw httpError(400, validation.message);
  }

  const desiredOrgRef = `Organization/${options.organizationId}`;
  const patientInputForMapping = providedLocalPatientId
    ? effectivePatientInput
    : {
        ...effectivePatientInput,
        HospitalNo: undefined,
      };

  const fhirPatient = toFhirPatient(patientInputForMapping, {
    identifierSystem: sourceIdentifierSystem,
    organizationReference: desiredOrgRef,
    sourceKey: options.sourceSystem,
  });

  const primaryIdentifier = fhirPatient.identifier?.[0];
  const hasPrimaryIdentifier = Boolean(
    primaryIdentifier?.system && primaryIdentifier?.value,
  );
  if (providedLocalPatientId && !hasPrimaryIdentifier) {
    throw httpError(
      400,
      'Patient identifier configuration is invalid (system/value missing).',
    );
  }

  if (selectedPatientId) {
    validateSelectedPatientDemographics(selectedPatient, fhirPatient);
    const selectedGoldenContext = await resolveGoldenPatientContext(
      fhirConfig,
      selectedPatient,
    );
    selectedGoldenPatientId = selectedGoldenContext?.goldenPatientId || null;
  }

  let resource = null;
  if (providedLocalPatientId && hasPrimaryIdentifier) {
    resource = await fetchPatientByPrimaryIdentifier(fhirConfig, {
      system: primaryIdentifier.system,
      value: primaryIdentifier.value,
    });
  }

  if (
    selectedPatientId &&
    resource?.id &&
    resource.id !== selectedPatientId &&
    !selectedGoldenPatientId
  ) {
    throw httpError(
      409,
      `Selected Patient/${selectedPatientId} is not linked to a golden patient yet. Confirm a candidate that already has an MDM link, or wait for MDM processing before retrying.`,
    );
  }

  let action = 'existing';
  let status = 200;

  if (!resource) {
    const createResponse =
      providedLocalPatientId && hasPrimaryIdentifier
        ? await createPatientConditionally(
            {
              baseUrl: fhirConfig.baseUrl,
              timeoutMs: fhirConfig.timeoutMs,
            },
            fhirPatient,
            {
              system: primaryIdentifier.system,
              value: primaryIdentifier.value,
            },
          )
        : await createPatient(
            {
              baseUrl: fhirConfig.baseUrl,
              timeoutMs: fhirConfig.timeoutMs,
            },
            fhirPatient,
          );

    resource = createResponse.data;
    status = createResponse.status;
    action = createResponse.status === 201 ? 'created' : 'existing';

    if (!resource?.id && providedLocalPatientId && hasPrimaryIdentifier) {
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

  let goldenPatientId = selectedGoldenPatientId || null;

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

    goldenPatientId = selectedGoldenPatientId;
  }

  if (!goldenPatientId && resource?.id) {
    await submitPatientToMdm(patientClientOptions(fhirConfig), resource.id);

    const resolvedContext = await resolveGoldenPatientContext(fhirConfig, resource);
    goldenPatientId = resolvedContext?.goldenPatientId || null;
  }

  if (resource?.id && goldenPatientId) {
    const withEnterpriseId = withEnterpriseIdentifier(resource, goldenPatientId);
    if (withEnterpriseId.changed) {
      const updateResponse = await updatePatient(
        {
          baseUrl: fhirConfig.baseUrl,
          timeoutMs: fhirConfig.timeoutMs,
        },
        withEnterpriseId.patient,
      );

      resource = updateResponse.data || withEnterpriseId.patient;
      status = updateResponse.status;
      if (action !== 'created') {
        action = 'updated';
      }
    }
  }

  return {
    status,
    action,
    resource,
    goldenPatientId,
    identifierSystem: sourceIdentifierSystem,
  };
}
