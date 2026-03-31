import createApp from './app.js';
import { registerWithOpenHIM } from './openhim/register.js';
import { logger } from './utils/logger.js';
import { loadConfig } from './config/env.js';

const mediatorConfig = await import('../mediatorConfig.json', {
  with: { type: 'json' },
});
const config = loadConfig();
const app = createApp({
  openhimConfig: config.openhim,
  fhirConfig: config.fhir,
});
app.listen(config.server.port, () => {
  logger.info(`Organization Mediator listening on port ${config.server.port}`);
  registerWithOpenHIM({
    openhimConfig: config.openhim,
    mediatorConfig: mediatorConfig.default,
  });
});
