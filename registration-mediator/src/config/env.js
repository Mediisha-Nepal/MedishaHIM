import { DEFAULTS } from './constants.js';

export function loadConfig() {
  const openhim = {
    username: process.env.OPENHIM_USERNAME || 'root@openhim.org',
    password: process.env.OPENHIM_PASSWORD || 'openhim-password',
    apiURL: process.env.OPENHIM_URL || 'https://openhim-core:8080',
    trustSelfSigned:
      String(process.env.OPENHIM_TRUST_SELF_SIGNED || 'true') === 'true',
    urn: process.env.MEDIATOR_URN,
  };

  const server = {
    port: Number(process.env.MEDIATOR_PORT || DEFAULTS.MEDIATOR_PORT),
  };

  const timeoutMs = Number(
    process.env.HTTP_TIMEOUT_MS || DEFAULTS.HTTP_TIMEOUT_MS,
  );

  const services = {
    fhir: {
      baseUrl: process.env.FHIR_BASE_URL || DEFAULTS.FHIR_BASE_URL,
      timeoutMs,
    },
    registration: {
      defaultSourceSystem:
        process.env.REGISTRATION_DEFAULT_SOURCE_SYSTEM ||
        DEFAULTS.DEFAULT_SOURCE_SYSTEM,
      organizationLookupIdentifierSystem:
        process.env.REGISTRATION_ORG_LOOKUP_IDENTIFIER_SYSTEM ||
        DEFAULTS.ORG_LOOKUP_IDENTIFIER_SYSTEM,
    },
  };

  return { openhim, server, services };
}
