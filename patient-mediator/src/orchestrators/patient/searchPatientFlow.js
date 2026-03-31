import {
  readOrganizationById,
  searchEncountersByPatient,
  searchPatientByDemographics,
  searchPatientByIdentifier,
} from '../../clients/clientRegistryApi.js';

function entriesFromBundle(bundle) {
  return Array.isArray(bundle?.entry) ? bundle.entry : [];
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

function parseReferenceId(reference, resourceType) {
  if (!reference || typeof reference !== 'string') return null;
  const expectedPrefix = `${resourceType}/`;
  if (!reference.startsWith(expectedPrefix)) return null;
  return reference.slice(expectedPrefix.length) || null;
}

function encounterSortKey(encounter) {
  const end = encounter?.period?.end;
  const start = encounter?.period?.start;
  const fallback = encounter?.meta?.lastUpdated;
  return end || start || fallback || '';
}

function toEncounterHospitalRef(encounter) {
  const reference = encounter?.serviceProvider?.reference;
  const id = parseReferenceId(reference, 'Organization');
  if (!id) return null;
  return {
    id,
    reference,
    date: encounterSortKey(encounter),
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
    organizations.map((org) => [org.id, org.resource?.name || null]),
  );

  return hospitalRefs.map((item) => ({
    id: item.id,
    reference: item.reference,
    name: byId.get(item.id) || null,
    date: item.date || null,
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
        item.date === encounterSortKey(encounter),
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

async function buildDemographicSummary(svcOpts, patient) {
  const encounterResp = await searchEncountersByPatient(svcOpts, patient.id);
  const encounters = encountersFromBundle(encounterResp.data);
  const hospitalRefs = encounters.map(toEncounterHospitalRef).filter(Boolean);
  const hospitals = await enrichHospitals(svcOpts, hospitalRefs);

  const sortedHospitals = [...hospitals].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')),
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
    });
  }

  return {
    patient_id: patient.id,
    name: getPatientDisplayName(patient),
    phone_number: getFirstPhone(patient),
    last_visited_hospital: hospitalsVisited[0] || null,
    hospitals_visited: hospitalsVisited,
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
    const results = await Promise.all(
      patients.map((patient) => buildDemographicSummary(svcOpts, patient)),
    );

    return {
      status: r.status,
      data: {
        mode: 'demographics_summary',
        total: results.length,
        results,
      },
    };
  } else {
    const err = new Error(
      'Provide either source identifier/value or complete demographics search fields.',
    );
    err.status = 400;
    throw err;
  }
}
