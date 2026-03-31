export function getNhidFromResponse(payload) {
  if (!payload) return undefined;
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return undefined;

  const direct = [
    payload.nhid,
    payload.identifier,
    payload.value,
    payload.existingNhid,
    payload.existing_nhid,
  ];

  for (const candidate of direct) {
    if (!candidate) continue;
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate === 'object') {
      if (typeof candidate.value === 'string') return candidate.value;
      if (typeof candidate.nhid === 'string') return candidate.nhid;
    }
  }

  return undefined;
}

export function isPossibleMatchResponse(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const markers = [
    payload.status,
    payload.matchStatus,
    payload.result,
    payload.code,
    payload.action,
  ];
  return markers.some(
    (value) =>
      typeof value === 'string' && value.toUpperCase() === 'POSSIBLE_MATCH',
  );
}

export function hasNhidIdentifier(patient, nhidSystem, nhidValue) {
  return (patient.identifier || []).some(
    (id) => id.system === nhidSystem && id.value === nhidValue,
  );
}

export function findAnyNhidIdentifier(patient, nhidSystem) {
  return (patient.identifier || []).find(
    (id) => id.system === nhidSystem && id.value,
  );
}

export function buildNhidRequestPayload(
  patient,
  sourceSystem,
  sourceValue,
  providedNhid,
) {
  const payload = {
    fhirId: patient.id,
    sourceSystem,
    sourceValue,
  };

  if (providedNhid) {
    payload.nhid = String(providedNhid);
  }

  return payload;
}
