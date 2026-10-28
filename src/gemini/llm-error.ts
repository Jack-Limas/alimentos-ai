import { AppError, type AiErrorCategory } from '../shared/errors/index.js';

/**
 * Fixed, safe messages per category. The raw text from Google is never sent
 * or logged: it can echo request details, including parts of the key.
 */
export const SAFE_MESSAGES: Readonly<Record<AiErrorCategory, string>> = Object.freeze({
  MODEL_NOT_FOUND: 'The configured Gemini model is not available',
  QUOTA_EXCEEDED: 'The Gemini quota was exceeded',
  TIMEOUT: 'Gemini did not answer in time',
  UPSTREAM_ERROR: 'Gemini could not produce a valid answer',
  INVALID_API_KEY: 'The Gemini API key is invalid or lacks permissions',
});

export class LlmError extends Error {
  constructor(
    public readonly category: AiErrorCategory,
    /** True for failures worth one more attempt (5xx, network, invalid JSON). */
    public readonly retryable = false,
    public readonly retryAfterSec?: number,
    message: string = SAFE_MESSAGES[category],
  ) {
    super(message);
    this.name = 'LlmError';
  }

  toAppError(): AppError {
    return AppError.ai(this.category, this.message, this.retryAfterSec);
  }
}
