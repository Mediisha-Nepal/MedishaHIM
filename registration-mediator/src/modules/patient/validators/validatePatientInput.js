const VALID_SEX = new Set([
  'M',
  'F',
  'O',
  'U',
  'MALE',
  'FEMALE',
  'OTHER',
  'UNKNOWN',
  '',
]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_IDENTIFIER_CATEGORIES = new Set(['nhid']);

function nonEmptyString(value) {
  const str = String(value ?? '').trim();
  return str.length > 0 ? str : undefined;
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

export function validatePatientInput(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Body must be a JSON object.' };
  }

  const hospitalNo =
    nonEmptyString(input.HospitalNo) || nonEmptyString(input.local_patient_id);

  if (!hospitalNo) {
    return {
      ok: false,
      message: 'HospitalNo (or local_patient_id) is required.',
    };
  }

  const fullName = nonEmptyString(input.Name);
  const hasNameParts =
    nonEmptyString(input.first_name) || nonEmptyString(input.last_name);

  if (!fullName && !hasNameParts) {
    return {
      ok: false,
      message: 'Name (or first_name/last_name) is required.',
    };
  }

  const dob = nonEmptyString(input.DOB) || nonEmptyString(input.dob);
  if (dob && !ISO_DATE_RE.test(dob)) {
    return { ok: false, message: 'DOB/dob must be in YYYY-MM-DD format.' };
  }

  const sex = nonEmptyString(input.Sex) || nonEmptyString(input.sex);
  if (sex && !VALID_SEX.has(String(sex).toUpperCase())) {
    return {
      ok: false,
      message:
        'Sex/sex must be one of: M, F, O, U, male, female, other, unknown.',
    };
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
