import { CONTENT_TYPES } from '../config/constants.js';

function issueCodeForStatus(status) {
  if (status === 400) return 'invalid';
  if (status === 401) return 'login';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'processing';
  if (status === 501) return 'not-supported';
  return 'exception';
}

export function operationOutcome(
  message,
  { code, severity = 'error', status = 500 } = {},
) {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity,
        code: code || issueCodeForStatus(status),
        diagnostics: message,
      },
    ],
  };
}

export function sendOutcome(res, status, message) {
  return res
    .status(status)
    .set('Content-Type', CONTENT_TYPES.FHIR_JSON)
    .json(operationOutcome(message, { status }));
}

export function extractErrorMessage(err) {
  return (
    err?.response?.data?.issue?.[0]?.diagnostics ||
    err.message ||
    'Unknown error'
  );
}

export function extractErrorStatus(err) {
  return err.status || err?.response?.status || 500;
}
