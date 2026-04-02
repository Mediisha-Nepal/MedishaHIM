import {
  readPatientById,
  readOrganizationById,
  queryMdmLinks,
  searchEncountersByPatient,
  searchPatientByDemographics,
  searchPatientByIdentifier,
} from '../../clients/clientRegistryApi.js';
import {
  firstLinkedGoldenPatient,
  isGoldenPatient,
  mdmLinksFromParameters,
  parseReferenceId,
} from '../../utils/mdm.js';

function entriesFromBundle(bundle) {
  return Array.isArray(bundle?.entry) ? bundle.entry : [];
}

function nonEmptyString(value) {
  const str = (value ?? '').toString().trim();
  return str.length ? str : undefined;
}

function patientsFromBundle(bundle) {
  return entriesFromBundle(bundle)
    .map((entry) => entry?.resource)
    .filter((resource) => resource?.resourceType === 'Patient' && resource?.id);
}

function encountersFromBundle(bundle) {
  return entriesFromBundle(bundle)
    .map((entry) => entry?.resource)
    .filter(
      (resource) => resource?.resourceType === 'Encounter' && resource?.id,
    );
}

function getFirstPhone(patient) {
  const telecom = Array.isArray(patient?.telecom) ? patient.telecom : [];
  const phone = telecom.find((item) => item?.system === 'phone' && item?.value);
  return phone?.value || null;
}

function getPatientDisplayName(patient) {
  const firstName = patient?.name?.[0];
  if (!firstName) return null;
  if (firstName.text) return firstName.text;
  const given = Array.isArray(firstName.given) ? firstName.given.join(' ') : '';
  const family = firstName.family || '';
  const combined = `${given} ${family}`.trim();
  return combined || null;
}

function getPatientAddresses(patient) {
  if (!Array.isArray(patient?.address)) return [];
  return patient.address;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

async function queryMdmLinksSafe(svcOpts, query) {
  try {
    const out = await queryMdmLinks(svcOpts, query);
    return mdmLinksFromParameters(out.data);
  } catch {
    return [];
  }
}

function encounterSortKey(encounter) {
  return {
    visitDate:
      encounter?.period?.end || encounter?.period?.start || encounter?.meta?.lastUpdated || '',
    updatedAt: encounter?.meta?.lastUpdated || '',
  };
}

function compareEncounterSortKeys(a, b) {
  const visitDateCompare = String(b?.visitDate || '').localeCompare(
    String(a?.visitDate || ''),
  );
  if (visitDateCompare !== 0) return visitDateCompare;

  return String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || ''));
}

function toEncounterHospitalRef(encounter) {
  const reference = encounter?.serviceProvider?.reference;
  const id = parseReferenceId(reference, 'Organization');
  if (!id) return null;
  return {
    id,
    reference,
    sortKey: encounterSortKey(encounter),
  };
}

function identifierTypeMatches(identifier, { texts = [], codes = [] }) {
  const text = nonEmptyString(identifier?.type?.text)?.toLowerCase();
  if (text && texts.includes(text)) return true;

  const codings = Array.isArray(identifier?.type?.coding)
    ? identifier.type.coding
    : [];

  return codings.some((coding) => {
    const code = nonEmptyString(coding?.code)?.toLowerCase();
    const display = nonEmptyString(coding?.display)?.toLowerCase();
    return codes.includes(code) || texts.includes(display);
  });
}

function hasHospitalIdType(identifier) {
  return identifierTypeMatches(identifier, {
    texts: [
      'hospital id',
      'organization id',
      'org id',
      'facility id',
      'hospital code',
      'facility code',
    ],
    codes: ['hospital-id', 'organization-id', 'org-id', 'facility-id'],
  });
}

function hasEmrType(identifier) {
  return identifierTypeMatches(identifier, {
    texts: ['hospital mrn', 'mrn', 'emr', 'hospital emr'],
    codes: ['mrn', 'emr'],
  });
}

function extractIdentifierValue(organization, matcher) {
  const identifiers = Array.isArray(organization?.identifier)
    ? organization.identifier
    : [];

  const matched = identifiers.find(
    (identifier) =>
      nonEmptyString(identifier?.value) && matcher(identifier),
  );

  return nonEmptyString(matched?.value) || null;
}

function extractHospitalMetadata(organization) {
  const firstIdentifierValue =
    extractIdentifierValue(organization, () => true) || null;

  return {
    name: nonEmptyString(organization?.name) || null,
    hospitalId:
      extractIdentifierValue(organization, hasHospitalIdType) ||
      firstIdentifierValue,
    emrNumber: extractIdentifierValue(organization, hasEmrType),
  };
}

async function enrichHospitals(svcOpts, hospitalRefs) {
  const uniqueIds = [...new Set(hospitalRefs.map((item) => item.id).filter(Boolean))];
  const organizations = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const out = await readOrganizationById(svcOpts, id);
        return { id, resource: out.data };
      } catch {
        return { id, resource: null };
      }
    }),
  );

  const byId = new Map(
    organizations.map((org) => [org.id, extractHospitalMetadata(org.resource)]),
  );

  return hospitalRefs.map((item) => ({
    id: item.id,
    reference: item.reference,
    name: byId.get(item.id)?.name || null,
    hospital_id: byId.get(item.id)?.hospitalId || item.id,
    emr_number: byId.get(item.id)?.emrNumber || null,
    sortKey: item.sortKey || null,
  }));
}

async function buildPatientWithEncounters(svcOpts, patient) {
  const encounterResp = await searchEncountersByPatient(svcOpts, patient.id);
  const encounters = encountersFromBundle(encounterResp.data);
  const hospitalRefs = encounters.map(toEncounterHospitalRef).filter(Boolean);
  const hospitals = await enrichHospitals(svcOpts, hospitalRefs);

  const encounterDetails = encounters.map((encounter) => {
    const hospital = hospitals.find(
      (item) =>
        item.reference === encounter?.serviceProvider?.reference &&
        compareEncounterSortKeys(item.sortKey, encounterSortKey(encounter)) === 0,
    );

    return {
      encounter,
      hospital: hospital || null,
    };
  });

  return {
    patient,
    encounters: encounterDetails,
  };
}

async function buildHospitalsVisited(svcOpts, patientIds) {
  const encounterBundles = await Promise.all(
    uniqueValues(patientIds).map(async (patientId) => {
      const encounterResp = await searchEncountersByPatient(svcOpts, patientId);
      return encountersFromBundle(encounterResp.data);
    }),
  );

  const encounters = encounterBundles.flat();
  const hospitalRefs = encounters.map(toEncounterHospitalRef).filter(Boolean);
  const hospitals = await enrichHospitals(svcOpts, hospitalRefs);

  const sortedHospitals = [...hospitals].sort((a, b) =>
    compareEncounterSortKeys(a.sortKey, b.sortKey),
  );

  const seen = new Set();
  const hospitalsVisited = [];
  for (const hospital of sortedHospitals) {
    if (seen.has(hospital.id)) continue;
    seen.add(hospital.id);
    hospitalsVisited.push({
      id: hospital.id,
      name: hospital.name,
      reference: hospital.reference,
      hospital_id: hospital.hospital_id,
      emr_number: hospital.emr_number,
    });
  }

  return hospitalsVisited;
}

async function readPatientSafe(svcOpts, id) {
  if (!id) return null;

  try {
    const out = await readPatientById(svcOpts, id);
    return out.data || null;
  } catch {
    return null;
  }
}

function matchRank(matchResult) {
  if (matchResult === 'MATCH') return 2;
  if (matchResult === 'POSSIBLE_MATCH') return 1;
  return 0;
}

function mergeCandidate(existing, incoming) {
  if (!existing) return incoming;

  return {
    ...existing,
    ...incoming,
    enterprisePatientId:
      incoming.enterprisePatientId || existing.enterprisePatientId || null,
    mdmMatchResult:
      matchRank(incoming.mdmMatchResult) >= matchRank(existing.mdmMatchResult)
        ? incoming.mdmMatchResult
        : existing.mdmMatchResult,
  };
}

async function resolveDemographicCandidates(svcOpts, patient) {
  if (isGoldenPatient(patient)) {
    const links = await queryMdmLinksSafe(svcOpts, {
      goldenResourceId: patient.id,
    });

    const sourceLinkMap = new Map();
    for (const link of links) {
      const sourcePatientId = parseReferenceId(link.sourceResourceId, 'Patient');
      if (!sourcePatientId) continue;

      const existing = sourceLinkMap.get(sourcePatientId);
      if (!existing || matchRank(link.matchResult) > matchRank(existing.matchResult)) {
        sourceLinkMap.set(sourcePatientId, {
          sourcePatientId,
          matchResult: link.matchResult || null,
        });
      }
    }

    const sourceCandidates = await Promise.all(
      [...sourceLinkMap.values()].map(async (link) => {
        const sourcePatient = await readPatientSafe(
          svcOpts,
          link.sourcePatientId,
        );

        if (!sourcePatient?.id) return null;

        return {
          patient: sourcePatient,
          sourcePatientId: sourcePatient.id,
          enterprisePatientId: patient.id,
          mdmMatchResult: link.matchResult,
        };
      }),
    );

    return sourceCandidates.filter(Boolean);
  }

  const links = await queryMdmLinksSafe(svcOpts, {
    resourceId: patient.id,
  });

  const linkedGoldenPatient = firstLinkedGoldenPatient(links);

  return [
    {
      patient,
      sourcePatientId: patient.id,
      enterprisePatientId: linkedGoldenPatient.goldenPatientId,
      mdmMatchResult: linkedGoldenPatient.matchResult,
    },
  ];
}

function dedupeCandidates(candidates) {
  const deduped = new Map();

  for (const candidate of candidates) {
    const key = candidate?.sourcePatientId || candidate?.patient?.id;
    if (!key) continue;
    deduped.set(key, mergeCandidate(deduped.get(key), candidate));
  }

  return [...deduped.values()];
}

function candidateGroupKey(candidate) {
  if (candidate.mdmMatchResult === 'MATCH' && candidate.enterprisePatientId) {
    return `enterprise:${candidate.enterprisePatientId}`;
  }

  return `source:${candidate.sourcePatientId}`;
}

function groupDemographicCandidates(candidates) {
  const groups = new Map();

  for (const candidate of candidates) {
    const key = candidateGroupKey(candidate);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        patientId:
          candidate.mdmMatchResult === 'MATCH' && candidate.enterprisePatientId
            ? candidate.enterprisePatientId
            : candidate.sourcePatientId,
        enterprisePatientId:
          candidate.mdmMatchResult === 'MATCH'
            ? candidate.enterprisePatientId || null
            : null,
        representativePatient: candidate.patient,
        sourcePatientIds: [candidate.sourcePatientId],
        sourcePatients: [candidate.patient],
      });
      continue;
    }

    existing.sourcePatientIds = uniqueValues([
      ...existing.sourcePatientIds,
      candidate.sourcePatientId,
    ]);
    existing.sourcePatients.push(candidate.patient);
  }

  return [...groups.values()];
}

function uniquePhoneNumbers(patients) {
  return uniqueValues((patients || []).map((patient) => getFirstPhone(patient)));
}

async function buildDemographicCandidateSummary(svcOpts, group) {
  const hospitalsVisited = await buildHospitalsVisited(
    svcOpts,
    group.sourcePatientIds,
  );
  const phoneNumbers = uniquePhoneNumbers(group.sourcePatients);

  return {
    patient_id: group.patientId,
    enterprise_patient_id: group.enterprisePatientId,
    name: getPatientDisplayName(group.representativePatient),
    address: getPatientAddresses(group.representativePatient),
    birth_date: group.representativePatient?.birthDate || null,
    gender: group.representativePatient?.gender || null,
    phone_number: phoneNumbers[0] || null,
    phone_numbers: phoneNumbers,
    last_visited_hospital: hospitalsVisited[0] || null,
    hospitals_visited: hospitalsVisited,
    source_patient_ids: group.sourcePatientIds,
    source_patient_count: group.sourcePatientIds.length,
  };
}

export async function searchPatientFlow(
  { serviceConfig },
  { sourceIdentifier, value, demographics },
) {
  const svcOpts = {
    baseUrl: serviceConfig.patientServiceBase,
    timeoutMs: serviceConfig.timeoutMs,
  };

  if (sourceIdentifier || value) {
    if (!sourceIdentifier || !value) {
      const err = new Error('Source identifier and value are required.');
      err.status = 400;
      throw err;
    }

    const r = await searchPatientByIdentifier(svcOpts, {
      system: sourceIdentifier,
      value,
    });

    const patients = patientsFromBundle(r.data);
    const results = await Promise.all(
      patients.map((patient) => buildPatientWithEncounters(svcOpts, patient)),
    );

    return {
      status: r.status,
      data: {
        mode: 'identifier',
        total: results.length,
        results,
      },
    };
  } else if (demographics) {
    const r = await searchPatientByDemographics(svcOpts, demographics);

    const patients = patientsFromBundle(r.data);
    const candidateLists = await Promise.all(
      patients.map((patient) => resolveDemographicCandidates(svcOpts, patient)),
    );
    const demographicCandidates = dedupeCandidates(candidateLists.flat());
    const groupedCandidates = groupDemographicCandidates(demographicCandidates);
    const results = await Promise.all(
      groupedCandidates.map((candidateGroup) =>
        buildDemographicCandidateSummary(svcOpts, candidateGroup),
      ),
    );

    return {
      status: r.status,
      data: {
        mode: 'demographics_candidates',
        total: results.length,
        results,
      },
    };
  } else {
    const err = new Error(
      'Provide either source identifier/value or required demographics search fields.',
    );
    err.status = 400;
    throw err;
  }
}
