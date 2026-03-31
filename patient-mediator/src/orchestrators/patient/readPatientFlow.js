import { readPatientById } from '../../clients/clientRegistryApi.js';

export async function readPatientFlow({ serviceConfig }, id) {
  if (!id) {
    const err = new Error('Patient id is required.');
    err.status = 400;
    throw err;
  }

  const r = await readPatientById(
    {
      baseUrl: serviceConfig.patientServiceBase,
      timeoutMs: serviceConfig.timeoutMs,
    },
    id,
  );

  return {
    status: r.status,
    data: r.data,
  };
}
