import { nonEmptyString } from './primitives.js';

const DEFAULT_MRN_TEMPLATE = 'https://registry.example.org/id/source/{source}/mrn';

export function buildSourceMrnSystem(sourceSystem, template = DEFAULT_MRN_TEMPLATE) {
  const normalized = nonEmptyString(sourceSystem);
  if (!normalized) {
    const err = new Error('source_system is required.');
    err.status = 400;
    throw err;
  }

  return template.replaceAll('{source}', normalized.toLowerCase());
}
