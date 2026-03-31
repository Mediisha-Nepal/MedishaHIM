import { bestMatchFromBundle, firstFromBundle } from './patientIdentifiers.js';

export function buildSearchByIdentifierBundle(items) {
  return {
    resourceType: 'Bundle',
    type: 'batch',
    entry: items.map(({ identifier }) => ({
      request: {
        method: 'GET',
        url: `Patient?identifier=${encodeURIComponent(`${identifier.system}|${identifier.value}`)}`,
      },
    })),
  };
}

export function buildDemographicsSearchBundle(items) {
  const entries = [];

  for (const { fhirPatient } of items) {
    const name = fhirPatient.name?.[0];
    const family = name?.family;
    const given = name?.given?.[0];
    const birthDate = fhirPatient.birthDate;
    const gender = fhirPatient.gender;

    const params = [];
    if (family) params.push(`family=${encodeURIComponent(family)}`);
    if (given) params.push(`given=${encodeURIComponent(given)}`);
    if (birthDate) params.push(`birthdate=${encodeURIComponent(birthDate)}`);
    if (gender) params.push(`gender=${encodeURIComponent(gender)}`);

    entries.push({
      request: {
        method: 'GET',
        url:
          params.length > 0
            ? `Patient?${params.join('&')}`
            : 'Patient?_summary=count',
      },
    });
  }

  return {
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  };
}

export function buildAdditionalIdSearchBundle(items) {
  const entries = [];
  const map = [];

  for (let i = 0; i < items.length; i++) {
    const additionalIds = (items[i].fhirPatient.identifier || []).slice(1);
    const indices = [];

    for (const addId of additionalIds) {
      if (!addId?.system || !addId?.value) continue;

      indices.push(entries.length);
      entries.push({
        request: {
          method: 'GET',
          url: `Patient?identifier=${encodeURIComponent(`${addId.system}|${addId.value}`)}`,
        },
      });
    }

    map.push(indices);
  }

  if (entries.length === 0) return null;
  return {
    bundle: { resourceType: 'Bundle', type: 'batch', entry: entries },
    map,
  };
}

export function buildWriteBundle(writeOps) {
  const entries = [];

  for (const op of writeOps) {
    if (op.action === 'create') {
      entries.push({
        resource: op.fhirPatient,
        request: {
          method: 'POST',
          url: 'Patient',
          ifNoneExist: `identifier=${op.identifier.system}|${op.identifier.value}`,
        },
      });
    } else {
      entries.push({
        resource: op.updatedPatient,
        request: {
          method: 'PUT',
          url: `Patient/${op.existingPatientId}`,
        },
      });
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  };
}

export function firstPatientFromBatchEntry(entry) {
  const status = entry?.response?.status || '';
  if (!status.startsWith('200')) return null;
  return firstFromBundle(entry?.resource);
}

export function bestPatientFromBatchEntry(
  entry,
  identifierSystem,
  identifierValue,
) {
  const status = entry?.response?.status || '';
  if (!status.startsWith('200')) return null;
  return bestMatchFromBundle(
    entry?.resource,
    identifierSystem,
    identifierValue,
  );
}

export function extractPatientIdFromLocation(location) {
  if (!location || typeof location !== 'string') return null;
  const match = location.match(/Patient\/([^/]+)/);
  return match?.[1] || null;
}
