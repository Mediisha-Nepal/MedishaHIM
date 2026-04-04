const VALID_SEX = new Set(['M', 'F', 'O', 'U', '']);
const VALID_FHIR_GENDER = new Set(['male', 'female', 'other', 'unknown']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_IDENTIFIER_CATEGORIES = new Set(['nhid']);

function nonEmptyString(value) {
  const str = (value ?? '').toString().trim();
  return str.length ? str : undefined;
}

function hasClientInjectedNhid(input) {
  if (!Array.isArray(input?.additional_identifier)) return false;

  return input.additional_identifier.some((identifier) => {
    const category = String(identifier?.category || '')
      .toLowerCase()
      .trim();
    return RESERVED_IDENTIFIER_CATEGORIES.has(category);
  });
}

export function normalizeSearchGender(gender) {
  const raw = nonEmptyString(gender);
  if (!raw) return undefined;

  const upper = raw.toUpperCase();
  if (upper === 'M') return 'male';
  if (upper === 'F') return 'female';
  if (upper === 'O') return 'other';
  if (upper === 'U') return 'unknown';

  const lower = raw.toLowerCase();
  if (VALID_FHIR_GENDER.has(lower)) return lower;

  return null;
}

export function validateDemographicsSearch(query) {
  const demographics = {
    given: nonEmptyString(query?.given),
    family: nonEmptyString(query?.family),
    birthDate: nonEmptyString(query?.birthDate),
    gender: nonEmptyString(query?.gender),
    phone: nonEmptyString(query?.phone),
  };

  const hasName = Boolean(demographics.given || demographics.family);
  if (!hasName) {
    return {
      ok: false,
      message:
        'Provide either identifier/value or at least one name field for demographics search (given, family, or name).',
    };
  }

  if (demographics.birthDate && !ISO_DATE_RE.test(demographics.birthDate)) {
    return { ok: false, message: 'birthDate must be in YYYY-MM-DD format.' };
  }

  let normalizedGender;
  if (demographics.gender) {
    normalizedGender = normalizeSearchGender(demographics.gender);
  }
  if (demographics.gender && !normalizedGender) {
    return {
      ok: false,
      message:
        'gender must be one of: male, female, other, unknown, M, F, O, U.',
    };
  }

  return {
    ok: true,
    demographics: {
      ...demographics,
      gender: normalizedGender || undefined,
    },
  };
}

export function validateExternalPatient(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Body must be a JSON object.' };
  }
  if (!input.local_patient_id) {
    return { ok: false, message: 'local_patient_id is required.' };
  }
  if (!input.first_name && !input.last_name) {
    return {
      ok: false,
      message: 'At least first_name or last_name is required.',
    };
  }
  if (input.dob && !ISO_DATE_RE.test(input.dob)) {
    return { ok: false, message: 'dob must be in YYYY-MM-DD format.' };
  }
  if (input.sex && !VALID_SEX.has((input.sex || '').toUpperCase())) {
    return { ok: false, message: 'sex must be one of: M, F, O, U.' };
  }

  if (hasClientInjectedNhid(input)) {
    return {
      ok: false,
      message:
        'additional_identifier category "nhid" is reserved and cannot be provided by clients.',
    };
  }

  return { ok: true };
}

export function validateBulkRequests({ source_system, patients }) {
  if (!source_system) {
    return { ok: false, message: 'source_system is required.' };
  }
  if (!Array.isArray(patients) || patients.length === 0) {
    return { ok: false, message: 'patients must be a non-empty array.' };
  }
  return { ok: true };
}
