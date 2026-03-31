function ok() {
  return { ok: true };
}

function fail(message) {
  return { ok: false, message };
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasIdentifier(body) {
  if (Array.isArray(body.identifier) && body.identifier.length > 0) {
    return body.identifier.some(
      (identifier) =>
        isNonEmptyString(identifier?.system) &&
        isNonEmptyString(identifier?.value),
    );
  }

  return isNonEmptyString(body.system) && isNonEmptyString(body.value);
}

export function validateExternalOrganization(body) {
  if (!body) return fail('Request body is required.');
  if (!isObject(body)) return fail('Request body must be a JSON object.');

  if (
    body.resourceType !== undefined &&
    String(body.resourceType) !== 'Organization'
  ) {
    return fail('resourceType must be "Organization" when provided.');
  }

  if (!hasIdentifier(body)) {
    return fail(
      'At least one identifier is required (identifier[] or system + value).',
    );
  }

  if (!isNonEmptyString(body.name)) {
    return fail('name is required and must be a non-empty string.');
  }

  if (body.active !== undefined && typeof body.active !== 'boolean') {
    return fail('active must be a boolean when provided.');
  }

  if (
    body.type !== undefined &&
    !(
      (Array.isArray(body.type) && body.type.length > 0) ||
      isObject(body.type)
    )
  ) {
    return fail('type must be an object or a non-empty array when provided.');
  }

  if (
    body.alias !== undefined &&
    !Array.isArray(body.alias) &&
    !isNonEmptyString(body.alias)
  ) {
    return fail('alias must be an array or string when provided.');
  }

  if (body.contact !== undefined) {
    const contacts = Array.isArray(body.contact) ? body.contact : [body.contact];
    if (contacts.length === 0) {
      return fail('contact must be an object or a non-empty array when provided.');
    }

    for (let i = 0; i < contacts.length; i += 1) {
      if (!isObject(contacts[i])) {
        return fail(`contact[${i}] must be an object.`);
      }
    }
  }

  if (body.partOf !== undefined && !isObject(body.partOf) && !isNonEmptyString(body.partOf)) {
    return fail('partOf must be an object or string reference when provided.');
  }

  if (body.endpoint !== undefined) {
    const endpoints = Array.isArray(body.endpoint)
      ? body.endpoint
      : [body.endpoint];
    if (endpoints.length === 0) {
      return fail('endpoint must be non-empty when provided.');
    }
  }

  if (body.qualification !== undefined) {
    const qualifications = Array.isArray(body.qualification)
      ? body.qualification
      : [body.qualification];

    for (let i = 0; i < qualifications.length; i += 1) {
      if (!isObject(qualifications[i])) {
        return fail(`qualification[${i}] must be an object.`);
      }
      if (!qualifications[i].code) {
        return fail(`qualification[${i}].code is required.`);
      }
    }
  }

  return ok();
}
