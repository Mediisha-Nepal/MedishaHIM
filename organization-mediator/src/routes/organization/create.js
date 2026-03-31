import { createOrganizationFlow } from '../../orchestrators/createOrganizationFlow.js';
import { CONTENT_TYPES } from '../../config/constants.js';

export function organizationCreate({ openhimConfig, fhirConfig }) {
  return async (req, res) => {
    const out = await createOrganizationFlow(
      { openhimConfig, fhirConfig },
      req.body,
    );

    res
      .status(out.status || 200)
      .set('Content-Type', CONTENT_TYPES.FHIR_JSON)
      .json(out);
  };
}
