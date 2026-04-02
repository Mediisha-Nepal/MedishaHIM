import express from 'express';
import asyncHandler from './utils/asyncHandler.js';
import heartbeat from './routes/heartbeat.js';
import { organizationCreate } from './routes/organization/create.js';
import { organizationDelete } from './routes/organization/delete.js';
import { organizationSearch } from './routes/organization/search.js';
import {
  extractErrorMessage,
  extractErrorStatus,
  sendOutcome,
} from './utils/error.js';
import { logger } from './utils/logger.js';

export default function createApp({ openhimConfig, fhirConfig }) {
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

  app.get('/heartbeat', asyncHandler(heartbeat));

  app.post(
    '/or/organization',
    asyncHandler(organizationCreate({ openhimConfig, fhirConfig })),
  );

  app.delete(
    '/or/organization',
    asyncHandler(organizationDelete({ fhirConfig })),
  );

  app.get('/or/organization', asyncHandler(organizationSearch({ fhirConfig })));

  // Centralised error handler
  app.use((err, _req, res, _next) => {
    console.log(err);
    const status = extractErrorStatus(err);
    const msg = extractErrorMessage(err);
    logger.error(`[${status}] ${msg}`);
    return sendOutcome(res, status, msg);
  });

  return app;
}
