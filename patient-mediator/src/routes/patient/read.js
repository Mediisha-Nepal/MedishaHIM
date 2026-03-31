import { CONTENT_TYPES } from '../../config/constants.js';
import { readPatientFlow } from '../../orchestrators/patient/readPatientFlow.js';

export function patientReadRoute({ serviceConfig }) {
  return async (req, res) => {
    const { id } = req.params;
    if (!id) {
      const err = new Error("Path param 'id' is required.");
      err.status = 400;
      throw err;
    }
    const out = await readPatientFlow({ serviceConfig }, id);
    res
      .status(out.status)
      .set('Content-Type', CONTENT_TYPES.FHIR_JSON)
      .json(out.data);
  };
}
