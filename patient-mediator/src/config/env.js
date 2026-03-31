import { DEFAULTS } from './constants.js';

export function loadConfig() {
  const openhim = {
    username: process.env.OPENHIM_USERNAME || 'root@openhim.org',
    password: process.env.OPENHIM_PASSWORD || 'openhim-password',
    apiURL: process.env.OPENHIM_URL || 'https://openhim-core:8080',
    trustSelfSigned:
      String(process.env.OPENHIM_TRUST_SELF_SIGNED || 'true') === 'true',
    urn: process.env.MEDIATOR_URN, // fallback to mediatorConfig.urn later
  };

  const service = {
    patientServiceBase: process.env.FHIR_BASE_URL || 'http://fhir:8080/fhir',
    timeoutMs: Number(process.env.HTTP_TIMEOUT_MS || DEFAULTS.HTTP_TIMEOUT_MS),
    nhidServiceBase:
      process.env.NHID_SERVICE_BASE || 'http://nhid-service:8090',
    nhidTimeoutMs: Number(
      process.env.NHID_TIMEOUT_MS || DEFAULTS.NHID_TIMEOUT_MS,
    ),
    nhidIdentifierSystem:
      process.env.NHID_IDENTIFIER_SYSTEM || DEFAULTS.NHID_IDENTIFIER_SYSTEM,
  };

  const server = {
    port: Number(process.env.MEDIATOR_PORT || DEFAULTS.MEDIATOR_PORT),
  };

  return { openhim, service, server };
}
