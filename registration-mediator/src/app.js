import express from 'express';
import asyncHandler from './utils/asyncHandler.js';
import heartbeat from './routes/heartbeat.js';
import { registerPatientRoute } from './routes/registration/registerPatient.js';
import {
  extractErrorMessage,
  extractErrorStatus,
  sendOutcome,
} from './utils/error.js';
import { logger } from './utils/logger.js';

export default function createApp({ services }) {
  const app = express();
  app.use(express.json());

  app.get('/heartbeat', asyncHandler(heartbeat));
  app.post(
    '/registration/patient',
    asyncHandler(
      registerPatientRoute({
        fhirConfig: services.fhir,
        registrationConfig: services.registration,
      }),
    ),
  );

  app.use((err, _req, res, _next) => {
    const status = extractErrorStatus(err);
    const msg = extractErrorMessage(err);
    logger.error(`[${status}] ${msg}`);
    return sendOutcome(res, status, msg);
  });

  return app;
}
