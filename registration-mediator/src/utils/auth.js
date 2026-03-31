import { nonEmptyString } from './primitives.js';

function parseBasicAuthUsername(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return undefined;

  try {
    const encoded = authHeader.slice('Basic '.length);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [username] = decoded.split(':');
    return nonEmptyString(username);
  } catch {
    return undefined;
  }
}

export function getClientIdFromRequest(req) {
  const fromOpenhim = nonEmptyString(req.header('x-openhim-clientid'));
  if (fromOpenhim) return fromOpenhim;

  const fromClientHeader = nonEmptyString(req.header('x-client-id'));
  if (fromClientHeader) return fromClientHeader;

  return parseBasicAuthUsername(req.header('authorization'));
}
