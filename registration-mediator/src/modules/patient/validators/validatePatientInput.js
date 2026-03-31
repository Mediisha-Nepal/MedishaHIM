const VALID_SEX = new Set(['M', 'F', 'O', 'U', '']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RESERVED_IDENTIFIER_CATEGORIES = new Set(['nhid']);

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

  if (input.sex && !VALID_SEX.has(String(input.sex || '').toUpperCase())) {
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
