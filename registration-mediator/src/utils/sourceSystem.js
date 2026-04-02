import { nonEmptyString } from './primitives.js';

const DEFAULT_MRN_TEMPLATE = 'https://registry.example.org/id/source/{source}/mrn';
const DEFAULT_ENCOUNTER_TEMPLATE =
  'https://registry.example.org/id/encounter/{source}';

function buildSourceScopedSystem(sourceSystem, template) {
  const normalized = nonEmptyString(sourceSystem);
  if (!normalized) {
    const err = new Error('source_system is required.');
    err.status = 400;
    throw err;
  }

  return template.replaceAll('{source}', normalized.toLowerCase());
}

export function buildSourceMrnSystem(sourceSystem, template = DEFAULT_MRN_TEMPLATE) {
  return buildSourceScopedSystem(sourceSystem, template);
}

export function buildSourceEncounterSystem(
  sourceSystem,
  template = DEFAULT_ENCOUNTER_TEMPLATE,
) {
  return buildSourceScopedSystem(sourceSystem, template);
}
