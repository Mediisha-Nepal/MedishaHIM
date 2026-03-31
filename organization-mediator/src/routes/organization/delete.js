import { deleteOrganization } from '../../clients/organizationRegistry.js';
import { CONTENT_TYPES } from '../../config/constants.js';

export function organizationDelete({ fhirConfig }) {
  return async (req, res) => {
    const { identifier, value } = req.query;
    const out = await deleteOrganization(
      { baseUrl: fhirConfig.baseURL, timeoutMs: fhirConfig.timeout },
      identifier,
      value,
    );
    res.status(200).set('Content-Type', CONTENT_TYPES.FHIR_JSON).json(out);
  };
}
