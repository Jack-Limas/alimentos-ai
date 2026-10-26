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
  ) {
    super(message);
    this.name = 'AppError';
  }

  /** Builds an AI failure whose code and category are the same value. */
  static ai(category: AiErrorCategory, message: string): AppError {
    return new AppError(AI_ERROR_CATEGORIES[category], category, message, category);
  }
}
