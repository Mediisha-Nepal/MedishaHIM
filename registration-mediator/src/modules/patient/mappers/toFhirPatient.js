import { nonEmptyString } from '../../../utils/primitives.js';

function mapGender(sex) {
  const normalized = String(sex || '').toUpperCase();
  if (normalized === 'M') return 'male';
  if (normalized === 'F') return 'female';
  if (normalized === 'O') return 'other';
  return 'unknown';
}

function buildTelecom({ phone, email }) {
  const telecom = [];

  if (phone) {
    telecom.push({ system: 'phone', value: String(phone), use: 'mobile' });
  }

  if (email) {
    telecom.push({ system: 'email', value: String(email), use: 'home' });
  }

  return telecom.length > 0 ? telecom : undefined;
}

function buildAddress(address) {
  if (!address) return undefined;

  return [
    {
      use: 'home',
      type: 'both',
      text: address.text || undefined,
      city: address.city || undefined,
      country: address.country || undefined,
    },
  ];
}

function urlAdditionalIdentifier(id) {
  return `https://registry.example.org/id/patient/${String(id).toLowerCase()}`;
}

function convertAdditionalIdentifier(additionalIdentifier) {
  return additionalIdentifier.map((identifier) => ({
    system: urlAdditionalIdentifier(identifier.category),
    value: String(identifier.value),
    type: identifier.type ? { text: identifier.type } : undefined,
  }));
}

export function toFhirPatient(input) {
  const first = nonEmptyString(input.first_name);
  const last = nonEmptyString(input.last_name);
  const fullName = [first, last].filter(Boolean).join(' ').trim() || undefined;

  const additionalIdentifier = Array.isArray(input.additional_identifier)
    ? convertAdditionalIdentifier(input.additional_identifier)
    : [];

  const patient = {
    resourceType: 'Patient',
    active: true,
    identifier: [
      {
        system: input.identifier_system,
        value: String(input.local_patient_id),
        type: { text: 'Hospital MRN' },
      },
      ...additionalIdentifier,
    ],
    name: [
      {
        use: 'official',
        family: last,
        given: first ? [first] : undefined,
        text: fullName,
      },
    ],
    gender: mapGender(input.sex),
    birthDate: input.dob || undefined,
  };

  const organizationReference =
    input.managingOrganization?.reference ||
    input.organization?.reference ||
    input.organization_id ||
    input.managing_organization_id;

  if (organizationReference) {
    const reference = String(organizationReference);
    patient.managingOrganization = {
      reference: reference.includes('/')
        ? reference
        : `Organization/${reference}`,
    };
  }

  const telecom = buildTelecom({ phone: input.phone, email: input.email });
  if (telecom) patient.telecom = telecom;

  const address = buildAddress(input.address);
  if (address) patient.address = address;

  return patient;
}
