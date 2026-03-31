import { CONTENT_TYPES } from '../../config/constants.js';
import { registerPatientWorkflow } from '../../modules/registration/workflows/registerPatientWorkflow.js';
import { getClientIdFromRequest } from '../../utils/auth.js';

export function registerPatientRoute({ fhirConfig, registrationConfig }) {
  return async (req, res) => {
    const out = await registerPatientWorkflow(
      {
        fhirConfig,
        registrationConfig,
        authContext: { clientId: getClientIdFromRequest(req) },
      },
      req.body,
    );

    return res
      .status(out.status)
      .set('Content-Type', CONTENT_TYPES.FHIR_JSON)
      .json(out.data);
  };
}
