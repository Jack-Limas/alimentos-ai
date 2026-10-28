import { LlmError } from './llm-error.js';

const QUOTA_MARKERS = /RESOURCE_EXHAUSTED|quota/i;
const KEY_MARKERS = /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|API_KEY_/i;

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = error.status;
  return typeof status === 'number' ? status : undefined;
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

/** Reads `"retryDelay": "23s"` or "retry in 23.5s" from a quota error; whole seconds, rounded up. */
export function parseRetryAfter(message: string): number | undefined {
  const match =
    /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i.exec(message) ??
    /retry in (\d+(?:\.\d+)?)\s*s/i.exec(message);
  if (!match?.[1]) return undefined;
  return Math.max(1, Math.ceil(Number(match[1])));
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError' || /aborted/i.test(error.message))
  );
}

/**
 * Turns anything the Gemini SDK throws into a category. Only the category,
 * a status and a retry hint survive; the original message is dropped.
 */
export function mapUpstreamError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (isAbortError(error)) return new LlmError('TIMEOUT');

  const status = statusOf(error);
  const text = textOf(error);

  if (status === 404) return new LlmError('MODEL_NOT_FOUND');
  if (status === 429 || QUOTA_MARKERS.test(text)) {
    return new LlmError('QUOTA_EXCEEDED', false, parseRetryAfter(text));
  }
  if (status === 401 || status === 403 || (status === 400 && KEY_MARKERS.test(text))) {
    return new LlmError('INVALID_API_KEY');
  }
  // 5xx, network failures (no status) and anything unexpected: one more attempt.
  return new LlmError('UPSTREAM_ERROR', status === undefined || status >= 500);
}
