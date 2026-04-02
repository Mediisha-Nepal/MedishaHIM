function nonEmptyString(value) {
  const str = (value ?? '').toString().trim();
  return str.length > 0 ? str : undefined;
}

function normalize(value) {
  return nonEmptyString(value)?.toLowerCase() || null;
}

function firstOfficialName(patient) {
  const names = Array.isArray(patient?.name) ? patient.name : [];
  return names[0] || null;
}

function splitNameText(nameText) {
  const tokens = String(nameText || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { given: null, family: null };
  }

  if (tokens.length === 1) {
    return { given: tokens[0], family: null };
  }

  return {
    given: tokens.slice(0, -1).join(' '),
    family: tokens[tokens.length - 1],
  };
}

function firstPhone(patient) {
  const telecom = Array.isArray(patient?.telecom) ? patient.telecom : [];
  const phone = telecom.find((item) => item?.system === 'phone' && item?.value);
  return nonEmptyString(phone?.value) || null;
}

export function toPatientDemographics(patient) {
  const name = firstOfficialName(patient);
  const givenFromArray = Array.isArray(name?.given) ? name.given[0] : undefined;
  const splitFromText = splitNameText(name?.text);
  const given = nonEmptyString(givenFromArray) || splitFromText.given;
  const family = nonEmptyString(name?.family) || splitFromText.family;

  return {
    given: nonEmptyString(given) || null,
    family: nonEmptyString(family) || null,
    birthDate: nonEmptyString(patient?.birthDate) || null,
    gender: nonEmptyString(patient?.gender) || null,
    phone: firstPhone(patient),
  };
}

export function hasExactMatchDemographics(demographics) {
  return Boolean(
    demographics?.given &&
      demographics?.family &&
      demographics?.birthDate &&
      demographics?.gender &&
      demographics?.phone,
  );
}

export function patientMatchesExactDemographics(patient, demographics) {
  const candidate = toPatientDemographics(patient);

  return (
    normalize(candidate.given) === normalize(demographics?.given) &&
    normalize(candidate.family) === normalize(demographics?.family) &&
    normalize(candidate.birthDate) === normalize(demographics?.birthDate) &&
    normalize(candidate.gender) === normalize(demographics?.gender) &&
    normalize(candidate.phone) === normalize(demographics?.phone)
  );
}

export function patientsFromBundle(bundle) {
  const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];

  return entries
    .map((entry) => entry?.resource)
    .filter((resource) => resource?.resourceType === 'Patient' && resource?.id);
}

export function findExactDemographicMatches(bundle, demographics) {
  return patientsFromBundle(bundle).filter((patient) =>
    patientMatchesExactDemographics(patient, demographics),
  );
}

export function conflictingDemographicFields(actual, expected) {
  const fields = ['given', 'family', 'birthDate', 'gender', 'phone'];

  return fields.filter((field) => {
    const actualValue = normalize(actual?.[field]);
    const expectedValue = normalize(expected?.[field]);

    return Boolean(actualValue && expectedValue && actualValue !== expectedValue);
  });
}
