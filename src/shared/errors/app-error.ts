import { AI_ERROR_CATEGORIES, type AiErrorCategory, type ErrorCode } from './error-codes.js';

/**
 * Expected, client-facing error. The global error handler serializes it as
 * `{ error: { code, category?, message } }`.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly category?: AiErrorCategory,
    /** Seconds the caller should wait (QUOTA_EXCEEDED), sent as Retry-After. */
    public readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }

  /** Builds an AI failure whose code and category are the same value. */
  static ai(category: AiErrorCategory, message: string, retryAfterSec?: number): AppError {
    return new AppError(AI_ERROR_CATEGORIES[category], category, message, category, retryAfterSec);
  }
}
