const compactObject = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }),
  );

const toReference = (resourceType, value) => {
  if (!value) return undefined;
  if (typeof value === 'object' && value.reference) return value;

  const raw = String(value).trim();
  if (!raw) return undefined;

  return {
    reference: raw.includes('/') ? raw : `${resourceType}/${raw}`,
  };
};

const buildIdentifiers = (input) => {
  if (Array.isArray(input.identifier) && input.identifier.length > 0) {
    return input.identifier;
  }

  if (input.system && input.value) {
    return [{ system: input.system, value: String(input.value) }];
  }

  return undefined;
};

const buildTelecom = ({ phone, email, website }) => {
  const telecom = [];
  if (phone) telecom.push({ system: 'phone', value: String(phone) });
  if (email) telecom.push({ system: 'email', value: String(email) });
  if (website) telecom.push({ system: 'url', value: String(website) });
  return telecom.length > 0 ? telecom : undefined;
};

const buildAddress = (address) => {
  if (!address) return undefined;
  if (Array.isArray(address)) return address;
  if (typeof address === 'string') return [{ text: address }];

  return [
    {
      ...address,
      postalCode: address.postalCode || address.postal_code,
    },
  ];
};

const mapHumanName = (value) => {
  if (!value) return undefined;
  if (typeof value === 'string') return [{ text: value }];
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'string' ? { text: item } : item,
    );
  }
  return [value];
};

const mapContactOrganizationRef = (organization) => {
  if (!organization) return undefined;
  if (typeof organization === 'object') return organization;
  return toReference('Organization', organization);
};

const buildSingleContact = (contactInput) => {
  if (!contactInput || typeof contactInput !== 'object') return undefined;

  const telecom =
    contactInput.telecom ||
    buildTelecom({
      phone: contactInput.phone || contactInput.contact_phone,
      email: contactInput.email || contactInput.contact_email,
      website: contactInput.website || contactInput.url,
    });

  const address =
    typeof contactInput.address === 'string'
      ? { text: contactInput.address }
      : contactInput.address;

  return compactObject({
    purpose: contactInput.purpose,
    name: mapHumanName(contactInput.name),
    telecom,
    address,
    organization: mapContactOrganizationRef(contactInput.organization),
    period: contactInput.period,
  });
};

const buildContacts = (input) => {
  if (Array.isArray(input.contact)) {
    const contacts = input.contact
      .map(buildSingleContact)
      .filter((contact) => Object.keys(contact || {}).length > 0);
    return contacts.length > 0 ? contacts : undefined;
  }

  if (input.contact && typeof input.contact === 'object') {
    const mapped = buildSingleContact(input.contact);
    return Object.keys(mapped || {}).length > 0 ? [mapped] : undefined;
  }

  const legacy = buildSingleContact({
    name: input.contact_name,
    phone: input.contact_phone,
    email: input.contact_email,
    website: input.contact_website,
    address: input.contact_address,
    organization: input.contact_organization,
    purpose: input.contact_purpose,
    period: input.contact_period,
  });

  return Object.keys(legacy || {}).length > 0 ? [legacy] : undefined;
};

const buildEndpoint = (endpoint) => {
  if (!endpoint) return undefined;

  const items = Array.isArray(endpoint) ? endpoint : [endpoint];
  const mapped = items
    .map((item) => {
      if (!item) return undefined;
      if (typeof item === 'object' && item.reference) return item;
      return toReference('Endpoint', item);
    })
    .filter(Boolean);

  return mapped.length > 0 ? mapped : undefined;
};

const buildQualification = (qualification) => {
  if (!qualification) return undefined;
  if (Array.isArray(qualification)) return qualification;
  if (typeof qualification === 'object') return [qualification];
  return undefined;
};

const normalizeAlias = (alias) => {
  if (!alias) return undefined;
  if (Array.isArray(alias)) return alias;
  if (typeof alias === 'string') return [alias];
  return undefined;
};

export default function toFhirOrganization(input) {
  const identifier = buildIdentifiers(input);
  const contact = buildContacts(input);
  const telecom = input.telecom
    ? input.telecom
    : buildTelecom({
        phone: input.phone,
        email: input.email,
        website: input.website || input.url,
      });
  const address = input.address ? buildAddress(input.address) : undefined;
  const alias = normalizeAlias(input.alias);

  // If caller already sends a FHIR Organization payload, keep it mostly as-is.
  if (input.resourceType === 'Organization') {
    return compactObject({
      ...input,
      resourceType: 'Organization',
      identifier: identifier || input.identifier,
      contact: contact || input.contact,
      telecom,
      address,
      alias,
      partOf: toReference(
        'Organization',
        input.partOf?.reference || input.partOf,
      ),
      endpoint: buildEndpoint(input.endpoint),
      qualification: buildQualification(input.qualification),
    });
  }

  return compactObject({
    resourceType: 'Organization',
    active: input.active,
    identifier,
    type: input.type,
    name: input.name,
    alias,
    description: input.description,
    contact,
    partOf: toReference(
      'Organization',
      input.partOf?.reference || input.part_of || input.partOf,
    ),
    endpoint: buildEndpoint(input.endpoint),
    qualification: buildQualification(input.qualification),
    telecom,
    address,
  });
}
