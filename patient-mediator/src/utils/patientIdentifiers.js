const IDENTIFIER_SYSTEM_TEMPLATE =
  'https://registry.example.org/id/source/{source}/mrn';

export function buildIdentifierSystem(sourceSystem) {
  return IDENTIFIER_SYSTEM_TEMPLATE.replace('{source}', sourceSystem);
}

export function firstFromBundle(bundle) {
  const entries = bundle?.entry || [];
  return entries.length > 0 ? entries[0].resource : null;
}

export function hasIdentifier(patient, system, value) {
  return (patient.identifier || []).some(
    (id) => id.system === system && id.value === value,
  );
}

export function hasDifferentIdentifierFromSameSystem(patient, system, value) {
  return (patient.identifier || []).some(
    (id) => id.system === system && id.value !== value,
  );
}

export function buildNhidConflictError(sourceSystem, sourceValue, patientId) {
  const err = new Error(
    `Invalid or duplicate NHID: source identifier ${sourceSystem}|${sourceValue} maps to a different patient (Patient/${patientId}).`,
  );
  err.status = 409;
  return err;
}

export function bestMatchFromBundle(bundle, identifierSystem, identifierValue) {
  const entries = bundle?.entry || [];
  for (const entry of entries) {
    const patient = entry.resource;
    if (!patient) continue;
    if (
      !hasDifferentIdentifierFromSameSystem(
        patient,
        identifierSystem,
        identifierValue,
      )
    ) {
      return patient;
    }
  }
  return null;
}

export function appendMissingIdentifiers(patient, newIdentifiers) {
  const updated = {
    ...patient,
    identifier: [...(patient.identifier || [])],
  };

  for (const id of newIdentifiers || []) {
    if (
      id?.system &&
      id?.value &&
      !hasIdentifier(updated, id.system, id.value)
    ) {
      updated.identifier.push(id);
    }
  }

  const changed =
    updated.identifier.length !== (patient.identifier || []).length;

  return { updated, changed };
}
