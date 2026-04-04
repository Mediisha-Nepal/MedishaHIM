import { resolveOrganization } from '../../organization/services/resolveOrganization.js';
import { registerPatient } from '../../patient/services/registerPatient.js';
import {
  queryMdmLinks,
  readPatientById,
} from '../../patient/clients/fhirPatientClient.js';
import {
  firstMatchGoldenPatientId,
  isGoldenPatient,
  mdmLinksFromParameters,
} from '../../patient/utils/mdm.js';
import {
  findExistingEncounterByIdentifier,
  registerEncounter,
} from '../../encounter/services/registerEncounter.js';
import { parseRegisterPatientRequest } from '../parsers/registerPatientRequest.js';

const GOLDEN_PATIENT_ID_EXTENSION_URL =
  'https://registry.example.org/fhir/StructureDefinition/golden-patient-id';

function toFullUrl(fhirBaseUrl, resource) {
  if (!resource?.resourceType || !resource?.id) return undefined;
  const base = String(fhirBaseUrl || '').replace(/\/$/, '');
  return `${base}/${resource.resourceType}/${resource.id}`;
}

function parsePatientIdFromReference(reference) {
  const raw = String(reference || '').trim();
  if (!raw) return null;
  if (!raw.includes('/')) return raw;
  if (!raw.startsWith('Patient/')) return null;
  return raw.slice('Patient/'.length) || null;
}

function buildRegistrationBundle({ fhirBaseUrl, patient, encounter }) {
  const resources = [patient, encounter].filter(Boolean);
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

function withGoldenPatientId(bundle, goldenPatientId) {
  if (!goldenPatientId) return bundle;

  const extension = {
    url: GOLDEN_PATIENT_ID_EXTENSION_URL,
    valueString: goldenPatientId,
  };

  return {
    ...bundle,
    extension: [...(bundle.extension || []), extension],
    entry: (bundle.entry || []).map((entry) => {
      if (entry?.resource?.resourceType !== 'Patient') return entry;
      return {
        ...entry,
        resource: {
          ...entry.resource,
          extension: [...(entry.resource.extension || []), extension],
        },
      };
    }),
  };
}

async function resolveGoldenPatientIdForPatient(fhirConfig, patient) {
  if (!patient?.id) return null;
  if (isGoldenPatient(patient)) return patient.id;

  const linksResponse = await queryMdmLinks(
    {
      baseUrl: fhirConfig.baseUrl,
      timeoutMs: fhirConfig.timeoutMs,
    },
    {
      resourceId: patient.id,
    },
  );

  return firstMatchGoldenPatientId(mdmLinksFromParameters(linksResponse.data), {
    resourceId: patient.id,
  });
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

  const organization = await resolveOrganization(
    { fhirConfig },
    parsed.organizationLookup,
  );

  const existingEncounter = await findExistingEncounterByIdentifier(
    { fhirConfig },
    parsed.encounter,
    {
      encounterIdentifierSystem: organization.encounterIdentifierSystem,
      sourceSystem: parsed.sourceSystem,
    },
  );

  if (existingEncounter?.id) {
    const existingEncounterPatientId = parsePatientIdFromReference(
      existingEncounter?.subject?.reference,
    );

    if (existingEncounterPatientId) {
      let existingPatientResponse;
      try {
        existingPatientResponse = await readPatientById(
          {
            baseUrl: fhirConfig.baseUrl,
            timeoutMs: fhirConfig.timeoutMs,
          },
          existingEncounterPatientId,
        );
      } catch (error) {
        if (error?.response?.status !== 404) {
          throw error;
        }
      }

      if (existingPatientResponse?.data?.id) {
        const bundle = buildRegistrationBundle({
          fhirBaseUrl: fhirConfig.baseUrl,
          patient: existingPatientResponse.data,
          encounter: existingEncounter,
        });
        const goldenPatientId = await resolveGoldenPatientIdForPatient(
          fhirConfig,
          existingPatientResponse.data,
        );

        return {
          status: 200,
          data: withGoldenPatientId(bundle, goldenPatientId),
        };
      }
    }
  }

  const patient = await registerPatient({ fhirConfig }, parsed.patient, {
    sourceSystem: parsed.sourceSystem,
    organizationId: organization.resource.id,
    patientIdentifierSystem: organization.patientIdentifierSystem,
    selectedPatientId: parsed.selectedPatientId,
  });

  const encounter = await registerEncounter({ fhirConfig }, parsed.encounter, {
    patientId: patient.resource.id,
    organizationId: organization.resource.id,
    encounterIdentifierSystem: organization.encounterIdentifierSystem,
    sourceSystem: parsed.sourceSystem,
  });

  const overallStatus =
    patient.action === 'created' || encounter?.action === 'created' ? 201 : 200;

  const bundle = buildRegistrationBundle({
    fhirBaseUrl: fhirConfig.baseUrl,
    patient: patient.resource,
    encounter: encounter.resource,
  });

  return {
    status: overallStatus,
    data: withGoldenPatientId(bundle, patient.goldenPatientId),
  };
}
