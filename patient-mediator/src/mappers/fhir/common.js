export function mapGender(sex) {
  const s = (sex || '').toUpperCase();
  if (s === 'M') return 'male';
  if (s === 'F') return 'female';
  if (s === 'O') return 'other';
  return 'unknown';
}

export function nonEmptyString(x) {
  const s = (x ?? '').toString().trim();
  return s.length ? s : undefined;
}

export function buildTelecom({ phone, email }) {
  const telecom = [];
  if (phone)
    telecom.push({ system: 'phone', value: String(phone), use: 'mobile' });
  if (email)
    telecom.push({ system: 'email', value: String(email), use: 'home' });
  return telecom.length ? telecom : undefined;
}

export function buildAddress(address) {
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

export function convertIdentifier(identifier) {
  return `https://registry.example.org/id/source/${identifier.toLowerCase()}/mrn`;
}

export function urlAdditionalIdentifier(id) {
  return `https://registry.example.org/id/patient/${id.toLowerCase()}`;
}

export function convertAdditionalIdentifier(additionalIdentifier) {
  return additionalIdentifier.map((identifier) => {
    return {
      system: urlAdditionalIdentifier(identifier.category),
      value: String(identifier.value),
      type: identifier.type ? { text: identifier.type } : undefined,
    };
  });
}
