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

  const server = {
    port: Number(process.env.MEDIATOR_PORT || DEFAULTS.MEDIATOR_PORT),
  };

  const fhir = {
    baseURL: process.env.FHIR_BASE_URL || 'http://fhir:8080/fhir',
    timeoutMs: Number(process.env.HTTP_TIMEOUT_MS || DEFAULTS.HTTP_TIMEOUT_MS),
  };

  return { openhim, server, fhir };
}
