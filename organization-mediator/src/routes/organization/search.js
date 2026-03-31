import { searchOrganization } from '../../clients/organizationRegistry.js';
import { CONTENT_TYPES } from '../../config/constants.js';

export function organizationSearch({ fhirConfig }) {
  return async (req, res) => {
    const { identifier, value } = req.query;
    const out = await searchOrganization(
      { baseUrl: fhirConfig.baseURL, timeoutMs: fhirConfig.timeoutMs },
      identifier,
      value,
    );
    res.status(200).set('Content-Type', CONTENT_TYPES.FHIR_JSON).json(out);
  };
}
