/**
 * Generic error codes of this service mapped to their HTTP status.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;

/**
 * AI failure categories (contract, section 5) with their suggested HTTP status.
 * The backend reads `category` to decide its 503 AI_UNAVAILABLE details.
 */
export const AI_ERROR_CATEGORIES = {
  MODEL_NOT_FOUND: 502,
  QUOTA_EXCEEDED: 429,
  TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
  INVALID_API_KEY: 500,
} as const;

export type AiErrorCategory = keyof typeof AI_ERROR_CATEGORIES;
export type ErrorCode = keyof typeof ERROR_CODES | AiErrorCategory;
