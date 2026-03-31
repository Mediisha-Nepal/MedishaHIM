import { validateExternalOrganization } from '../utils/validData.js';
import toFhirOrganization from '../mapper/fhir.js';
import { createClient } from '../openhim/createClient.js';
import { createOrganization } from '../clients/organizationRegistry.js';

function resolvePrimaryIdentifier(input, fhirOrganization) {
  const fromFhir = Array.isArray(fhirOrganization?.identifier)
    ? fhirOrganization.identifier.find(
        (identifier) => identifier?.system && identifier?.value,
      )
    : undefined;

  if (fromFhir) {
    return {
      system: String(fromFhir.system),
      value: String(fromFhir.value),
    };
  }

  if (input?.system && input?.value) {
    return {
      system: String(input.system),
      value: String(input.value),
    };
  }

  return null;
}

export async function createOrganizationFlow(
  { openhimConfig, fhirConfig },
  externalBody,
) {
  try {
    const v = validateExternalOrganization(externalBody);
    if (!v.ok) {
      const err = new Error(v.message);
      err.status = 400;
      throw err;
    }

    const fhirOutput = toFhirOrganization(externalBody);
    const primaryIdentifier = resolvePrimaryIdentifier(externalBody, fhirOutput);
    if (!primaryIdentifier) {
      const err = new Error(
        'Organization requires at least one identifier with system and value.',
      );
      err.status = 400;
      throw err;
    }

    const createOrgResponse = await createOrganization(
      {
        baseUrl: fhirConfig.baseURL,
        timeoutMs: fhirConfig.timeoutMs,
      },
      fhirOutput,
      primaryIdentifier.value,
      primaryIdentifier.system,
    );

    const clientResponse = await createClient(
      { openhimConfig },
      { clientId: primaryIdentifier.value, name: fhirOutput.name },
    );

    const type = createOrgResponse.status === 201 ? 'create' : 'update';
    return {
      ...createOrgResponse,
      type,
      client_credentials: {
        clientId: clientResponse.clientId,
        rawPassword: clientResponse.plainPassword,
      },
    };
  } catch (err) {
    console.error('Error in createOrganizationFlow:', err);
    throw err;
  }
}
