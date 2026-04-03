import express from 'express';
import cors from 'cors';
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
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    return next();
  });
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      optionsSuccessStatus: 204,
      maxAge: 86400,
    }),
  );
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
