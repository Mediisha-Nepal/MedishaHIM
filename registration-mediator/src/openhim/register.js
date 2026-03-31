import openhimUtils from 'openhim-mediator-utils';
import { logger } from '../utils/logger.js';

const { registerMediator, activateHeartbeat } = openhimUtils;

export function registerWithOpenHIM({ openhimConfig, mediatorConfig }) {
  const cfg = {
    ...openhimConfig,
    urn: openhimConfig.urn || mediatorConfig.urn,
  };

  logger.info('Using OpenHIM:', cfg.apiURL, cfg.username);

  registerMediator(cfg, mediatorConfig, (err) => {
    if (err) throw new Error(`Failed to register mediator. ${err}`);
    logger.info('Mediator registered in OpenHIM.');
  });

  activateHeartbeat(cfg);
}
