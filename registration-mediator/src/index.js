import createApp from './app.js';
import { loadConfig } from './config/env.js';
import { registerWithOpenHIM } from './openhim/register.js';
import { logger } from './utils/logger.js';

const mediatorConfig = await import('../mediatorConfig.json', {
  with: { type: 'json' },
});

const config = loadConfig();

const app = createApp({ services: config.services });

app.listen(config.server.port, () => {
  logger.info(`Registration Mediator listening on port ${config.server.port}`);
  registerWithOpenHIM({
    openhimConfig: config.openhim,
    mediatorConfig: mediatorConfig.default,
  });
});
