import express from 'express';
import cors from 'cors';
import asyncHandler from './utils/asyncHandler.js';
import heartbeat from './routes/heartbeat.js';
import { encounterCreate } from './routes/encounter/create.js';
import { encounterRead } from './routes/encounter/read.js';
import { encounterSearch } from './routes/encounter/search.js';
import {
  extractErrorMessage,
  extractErrorStatus,
  sendOutcome,
} from './utils/error.js';
import { logger } from './utils/logger.js';

export default function createApp({ fhirConfig }) {
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

  app.post('/er/encounter', asyncHandler(encounterCreate({ fhirConfig })));

  app.get('/er/encounter', asyncHandler(encounterSearch({ fhirConfig })));
  app.get('/er/encounter/:id', asyncHandler(encounterRead({ fhirConfig })));

  // Centralized error handler
  app.use((err, _req, res, _next) => {
    const status = extractErrorStatus(err);
    const msg = extractErrorMessage(err);
    logger.error(`[${status}] ${msg}`);
    return sendOutcome(res, status, msg);
  });

  return app;
}
