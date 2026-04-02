import { nonEmptyString } from '../../../utils/primitives.js';

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapGender(sex) {
  const normalized = String(sex || '').trim().toUpperCase();

  if (['M', 'MALE'].includes(normalized)) return 'male';
  if (['F', 'FEMALE'].includes(normalized)) return 'female';
  if (['O', 'OTHER'].includes(normalized)) return 'other';

  return 'unknown';
}

function normalizeReference(value, resourceType = 'Organization') {
  const ref = nonEmptyString(value);
  if (!ref) return undefined;
  return ref.includes('/') ? ref : `${resourceType}/${ref}`;
}

function buildOrganizationReference(row, context = {}) {
  return normalizeReference(
    context.organizationReference ||
      row.managingOrganization?.reference ||
      row.organization?.reference ||
      row.organization_id ||
      row.managing_organization_id ||
      row.OrganizationId ||
      row.OrganizationID,
  );
}

function buildIdentifierSystem(row, context = {}) {
  if (context.identifierSystem) return context.identifierSystem;
  if (row.identifier_system) return String(row.identifier_system);

  const sourceKey =
    slugify(
      context.sourceKey ||
        row.source_key ||
        row.source ||
        row.hospital_slug ||
        row.hospital_code ||
        row.DecodehospitalNo ||
        'unknown-hospital',
    ) || 'unknown-hospital';

  return `https://registry.example.org/id/source/${sourceKey}/mrn`;
}

function buildIdentifiers(row, context = {}, organizationReference) {
  const hospitalNo = nonEmptyString(row.HospitalNo);
  if (!hospitalNo) return undefined;

  const identifier = {
    system: buildIdentifierSystem(row, context),
    value: hospitalNo,
    type: { text: 'Hospital MRN' },
  };

  if (organizationReference) {
    identifier.assigner = { reference: organizationReference };
  }

  return [identifier];
}

function buildName(row) {
  const fullName =
    nonEmptyString(row.Name) ||
    [nonEmptyString(row.first_name), nonEmptyString(row.last_name)]
      .filter(Boolean)
      .join(' ')
      .trim();

  if (!fullName) return undefined;

  const tokens = fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const family =
    tokens.length > 1 ? tokens[tokens.length - 1] : nonEmptyString(row.last_name);
  const givenText =
    tokens.length > 1
      ? tokens.slice(0, -1).join(' ')
      : nonEmptyString(row.first_name) || tokens[0];

  return [
    {
      use: 'official',
      family: family || undefined,
      given: givenText ? [givenText] : undefined,
      text: fullName,
    },
  ];
}

function buildTelecom(row) {
  const telecom = [];
  const seen = new Set();

  const addTelecom = (system, value, use) => {
    const cleaned = nonEmptyString(value);
    if (!cleaned) return;

    const key = `${system}|${cleaned}|${use || ''}`;
    if (seen.has(key)) return;
    seen.add(key);

    const entry = { system, value: cleaned };
    if (use) entry.use = use;
    telecom.push(entry);
  };

  addTelecom('phone', row.MobileNo, 'mobile');
  addTelecom('phone', row.PhoneNo, 'home');
  addTelecom('email', row.Email, 'home');

  return telecom.length > 0 ? telecom : undefined;
}

function buildAddress(row, context = {}) {
  const addressText = nonEmptyString(row.Address);
  const province = nonEmptyString(row.province);
  const district = nonEmptyString(row.district);
  const municipality = nonEmptyString(row.nagarpalika);
  const ward = nonEmptyString(row.ward);
  const country = nonEmptyString(context.country || row.country || 'NP');

  const hasAnyAddressPart =
    addressText || province || district || municipality || ward || country;

  if (!hasAnyAddressPart) return undefined;

  const line = [];
  if (addressText) line.push(addressText);
  if (ward) line.push(`Ward ${ward}`);

  return [
    {
      use: 'home',
      type: 'physical',
      line: line.length > 0 ? line : undefined,
      city: municipality || undefined,
      district: district || undefined,
      state: province || undefined,
      country: country || undefined,
      text: addressText || undefined,
    },
  ];
}

function buildContact(row) {
  const contactName = nonEmptyString(row.ContactPersonName);
  const relationship = nonEmptyString(row.RelationShip);
  const contactEmail = nonEmptyString(row.ContactPersonEmail);

  if (!contactName && !relationship && !contactEmail) return undefined;

  const contact = {};

  if (contactName) {
    contact.name = { text: contactName };
  }

  if (relationship) {
    contact.relationship = [{ text: relationship }];
  }

  if (contactEmail) {
    contact.telecom = [
      {
        system: 'email',
        value: contactEmail,
        use: 'home',
      },
    ];
  }

  return [contact];
}

export function toFhirPatient(row, context = {}) {
  const organizationReference = buildOrganizationReference(row, context);

  const patient = {
    resourceType: 'Patient',
    active: typeof context.active === 'boolean' ? context.active : true,
  };

  const identifier = buildIdentifiers(row, context, organizationReference);
  if (identifier) patient.identifier = identifier;

  const name = buildName(row);
  if (name) patient.name = name;

  patient.gender = mapGender(row.Sex ?? row.sex);

  const birthDate = nonEmptyString(row.DOB || row.dob);
  if (birthDate) patient.birthDate = birthDate;

  const telecom = buildTelecom(row);
  if (telecom) patient.telecom = telecom;

  const address = buildAddress(row, context);
  if (address) patient.address = address;

  const contact = buildContact(row);
  if (contact) patient.contact = contact;

  if (organizationReference) {
    patient.managingOrganization = {
      reference: organizationReference,
    };
  }

  return patient;
}
