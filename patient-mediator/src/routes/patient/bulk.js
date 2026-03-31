import { bulkCreatePatientFlow } from '../../orchestrators/patient/bulkCreatePatientFlow.js';

export function patientBulkCreateRoute({ serviceConfig }) {
  return async (req, res) => {
    const { source_system: sourceSystem, patients } = req.body;
    const out = await bulkCreatePatientFlow(
      { serviceConfig },
      { sourceSystem, patients },
    );
    res.status(out.status).json(out.data);
  };
}
