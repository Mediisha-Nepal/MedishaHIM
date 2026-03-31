import { sendOutcome } from '../../utils/error.js';

export function encounterRead(_deps) {
  return async (_req, res) => {
    return sendOutcome(res, 501, 'Encounter read flow not implemented yet');
  };
}
