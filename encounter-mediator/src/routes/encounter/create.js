import { CONTENT_TYPES } from '../../config/constants.js';
import { createEncounterFlow } from '../../orchestrators/encounter/createEncounterFlow.js';

export function encounterCreate({ fhirConfig }) {
  return async (req, res) => {
    const out = await createEncounterFlow({ fhirConfig }, req.body);
    return res
      .status(out.status)
      .set('Content-Type', CONTENT_TYPES.FHIR_JSON)
      .json(out.data);
  };
}
