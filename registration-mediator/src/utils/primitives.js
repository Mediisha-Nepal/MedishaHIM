export function nonEmptyString(value) {
  const str = (value ?? '').toString().trim();
  return str.length > 0 ? str : undefined;
}

export function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    }),
  );
}
