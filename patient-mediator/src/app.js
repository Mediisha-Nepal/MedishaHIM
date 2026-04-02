import express from 'express';
import { heartbeatRoute } from './routes/heartbeat.js';
import { patientSearchRoute } from './routes/patient/search.js';
import { patientReadRoute } from './routes/patient/read.js';
import {
  sendOutcome,
  extractErrorMessage,
  extractErrorStatus,
} from './utils/error.js';
import { logger } from './utils/logger.js';
import { patientBulkCreateRoute } from './routes/patient/bulk.js';

/**
 * Wrap an async route handler so thrown errors are forwarded to Express.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function buildApp({ serviceConfig }) {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  app.use(express.json());

  // ── Routes ──
  app.get('/heartbeat', heartbeatRoute);
  app.post(
    '/cr/patient/bulk',
    asyncHandler(patientBulkCreateRoute({ serviceConfig })),
  );

  app.get('/cr/patient', asyncHandler(patientSearchRoute({ serviceConfig })));
  app.get('/cr/patient/:id', asyncHandler(patientReadRoute({ serviceConfig })));

  // ── Centralised FHIR error handler ──
  app.use((err, _req, res, _next) => {
    const status = extractErrorStatus(err);
    const msg = extractErrorMessage(err);
    logger.error(`[${status}] ${msg}`);
    return sendOutcome(res, status, msg);
  });

  return app;
}
