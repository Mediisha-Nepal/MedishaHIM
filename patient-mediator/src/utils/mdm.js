function nonEmptyString(value) {
  const str = (value ?? '').toString().trim();
  return str.length ? str : undefined;
}

function valueFromParameter(parameter) {
  return (
    nonEmptyString(parameter?.valueString) ||
    nonEmptyString(parameter?.valueUri) ||
    nonEmptyString(parameter?.valueCode)
  );
}

const MDM_MANAGED_SYSTEM =
  'https://hapifhir.org/NamingSystem/managing-mdm-system';
const MDM_MANAGED_CODE = 'HAPI-MDM';

export function parseReferenceId(reference, resourceType) {
  const raw = nonEmptyString(reference);
  if (!raw) return null;

  const prefix = `${resourceType}/`;
  if (!raw.startsWith(prefix)) return null;

  return raw.slice(prefix.length) || null;
}

export function isGoldenPatient(patient) {
  const tags = Array.isArray(patient?.meta?.tag) ? patient.meta.tag : [];

  return tags.some(
    (tag) =>
      nonEmptyString(tag?.system) === MDM_MANAGED_SYSTEM &&
      nonEmptyString(tag?.code) === MDM_MANAGED_CODE,
  );
}

export function mdmLinksFromParameters(parametersResource) {
  const parameters = Array.isArray(parametersResource?.parameter)
    ? parametersResource.parameter
    : [];

  return parameters
    .filter((parameter) => parameter?.name === 'link')
    .map((parameter) => {
      const parts = Array.isArray(parameter?.part) ? parameter.part : [];

      const link = {};
      for (const part of parts) {
        const key = nonEmptyString(part?.name);
        const value = valueFromParameter(part);
        if (!key || !value) continue;
        link[key] = value;
      }

      return link;
    })
    .filter(
      (link) =>
        nonEmptyString(link.goldenResourceId) ||
        nonEmptyString(link.sourceResourceId),
    );
}

export function firstLinkedGoldenPatient(links, options = {}) {
  const prioritizedResults = ['REDIRECT', 'MATCH', 'POSSIBLE_MATCH'];
  const focusedResourceId = nonEmptyString(options?.resourceId);
  const focusedSourceReference = focusedResourceId
    ? `Patient/${focusedResourceId}`
    : null;

  const withGoldenReference = (links || []).filter((candidate) =>
    parseReferenceId(candidate?.goldenResourceId, 'Patient'),
  );

  const focusedLinks = focusedSourceReference
    ? withGoldenReference.filter(
        (candidate) =>
          nonEmptyString(candidate?.sourceResourceId) === focusedSourceReference,
      )
    : withGoldenReference;

  const searchLinks =
    focusedLinks.length > 0 ? focusedLinks : withGoldenReference;

  for (const matchResult of prioritizedResults) {
    const link = searchLinks.find(
      (candidate) =>
        candidate?.matchResult === matchResult &&
        parseReferenceId(candidate?.goldenResourceId, 'Patient'),
    );

    if (link) {
      return {
        goldenPatientId: parseReferenceId(link.goldenResourceId, 'Patient'),
        matchResult,
      };
    }
  }

  return {
    goldenPatientId: null,
    matchResult: null,
  };
}
