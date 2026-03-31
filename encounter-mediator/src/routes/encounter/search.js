import { sendOutcome } from '../../utils/error.js';

export function encounterSearch(_deps) {
  return async (_req, res) => {
    return sendOutcome(res, 501, 'Encounter search flow not implemented yet');
  };
}
