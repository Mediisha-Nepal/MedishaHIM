import { searchOrganizationByIdentifier } from '../clients/fhirOrganizationClient.js';
import { firstResourceFromBundle } from '../../../utils/bundle.js';
import { httpError } from '../../../utils/httpError.js';
import { nonEmptyString } from '../../../utils/primitives.js';

function hasHospitalMrnType(identifier) {
  const text = nonEmptyString(identifier?.type?.text)?.toLowerCase();
  if (text && (text === 'hospital mrn' || text === 'mrn')) return true;

  const codings = Array.isArray(identifier?.type?.coding)
    ? identifier.type.coding
    : [];

  return codings.some((coding) => {
    const code = nonEmptyString(coding?.code)?.toLowerCase();
    const display = nonEmptyString(coding?.display)?.toLowerCase();
    return code === 'mrn' || display === 'hospital mrn' || display === 'mrn';
  });
}

function extractPatientIdentifierSystem(organization) {
  const identifiers = Array.isArray(organization?.identifier)
    ? organization.identifier
    : [];

  const mrnIdentifier = identifiers.find(
    (identifier) =>
      nonEmptyString(identifier?.system) && hasHospitalMrnType(identifier),
  );

  return nonEmptyString(mrnIdentifier?.system);
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
  };
}
