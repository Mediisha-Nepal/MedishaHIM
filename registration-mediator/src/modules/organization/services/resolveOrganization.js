import { searchOrganizationByIdentifier } from '../clients/fhirOrganizationClient.js';
import { firstResourceFromBundle } from '../../../utils/bundle.js';
import { httpError } from '../../../utils/httpError.js';
import { nonEmptyString } from '../../../utils/primitives.js';

function identifierTypeMatches(identifier, { texts = [], codes = [] }) {
  const text = nonEmptyString(identifier?.type?.text)?.toLowerCase();
  if (text && texts.includes(text)) return true;

  const codings = Array.isArray(identifier?.type?.coding)
    ? identifier.type.coding
    : [];

  return codings.some((coding) => {
    const code = nonEmptyString(coding?.code)?.toLowerCase();
    const display = nonEmptyString(coding?.display)?.toLowerCase();
    return codes.includes(code) || texts.includes(display);
  });
}

function hasHospitalMrnType(identifier) {
  return identifierTypeMatches(identifier, {
    texts: ['hospital mrn', 'mrn'],
    codes: ['mrn'],
  });
}

function hasHospitalVnType(identifier) {
  return identifierTypeMatches(identifier, {
    texts: ['hospital vn', 'vn', 'visit number', 'hospital visit number'],
    codes: ['vn'],
  });
}

function extractIdentifierSystem(organization, matcher) {
  const identifiers = Array.isArray(organization?.identifier)
    ? organization.identifier
    : [];

  const matchedIdentifier = identifiers.find(
    (identifier) =>
      nonEmptyString(identifier?.system) && matcher(identifier),
  );

  return nonEmptyString(matchedIdentifier?.system);
}

function extractPatientIdentifierSystem(organization) {
  return extractIdentifierSystem(organization, hasHospitalMrnType);
}

function extractEncounterIdentifierSystem(organization) {
  return extractIdentifierSystem(organization, hasHospitalVnType);
}

export async function resolveOrganization({ fhirConfig }, lookup) {
  if (!nonEmptyString(lookup?.system) || !nonEmptyString(lookup?.value)) {
    throw httpError(400, 'Organization lookup requires system and value.');
  }

  const response = await searchOrganizationByIdentifier(
    {
      baseUrl: fhirConfig.baseUrl,
      timeoutMs: fhirConfig.timeoutMs,
    },
    lookup,
  );

  const organization = firstResourceFromBundle(response.data, 'Organization');
  if (!organization?.id) {
    throw httpError(
      404,
      `Organization not found for ${lookup.system}|${lookup.value}.`,
    );
  }

  return {
    lookup,
    resource: organization,
    patientIdentifierSystem: extractPatientIdentifierSystem(organization),
    encounterIdentifierSystem: extractEncounterIdentifierSystem(organization),
  };
}
