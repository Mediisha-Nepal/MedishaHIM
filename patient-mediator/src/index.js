import { createRequire } from 'module';
import { loadConfig } from './config/env.js';
import { buildApp } from './app.js';
import { registerWithOpenHIM } from './openhim/register.js';
import { logger } from './utils/logger.js';

const require = createRequire(import.meta.url);
const mediatorConfig = require('../mediatorConfig.json');

const config = loadConfig();
const app = buildApp({
  serviceConfig: config.service,
});

app.listen(config.server.port, () => {
  logger.info(`client-registry-mediator listening on ${config.server.port}`);
  registerWithOpenHIM({ openhimConfig: config.openhim, mediatorConfig });
});
