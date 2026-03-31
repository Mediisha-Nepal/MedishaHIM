export const CONTENT_TYPES = {
  FHIR_JSON: 'application/fhir+json',
  JSON: 'application/json',
};

export const DEFAULTS = {
  MEDIATOR_PORT: 3003,
  HTTP_TIMEOUT_MS: 20000,
  FHIR_BASE_URL: 'http://fhir:8080/fhir',
  DEFAULT_SOURCE_SYSTEM: 'REGISTRATION',
  ORG_LOOKUP_IDENTIFIER_SYSTEM:
    'https://nepal-health.example.org/organization-id',
};
