import dotenv from 'dotenv';
import { z } from 'zod';

const optionalString = z.string().trim().min(1).optional();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  // Shared secret with alimentos-backend, sent as X-Internal-Key.
  AI_INTERNAL_KEY: z.string().min(32, 'must be at least 32 characters long'),

  // Gemini. Only this service knows the API key; without it the AI endpoints answer
  // INVALID_API_KEY ("not configured") instead of failing at startup.
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,
  // Below the backend's 15 s timeout, so the backend always gets our answer (or our TIMEOUT).
  AI_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(14_000).default(12_000),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * Parses and validates the given environment. Error messages only include
 * variable names and rules, never values, so secrets are not leaked to logs.
 */
export function parseEnv(rawSource: NodeJS.ProcessEnv): Env {
  // Empty values (e.g. `PORT=` copied from .env.example) are treated as unset.
  const source = Object.fromEntries(
    Object.entries(rawSource).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)';
    const isMissing = issue.code === 'invalid_type' && source[name] === undefined;
    return isMissing ? `${name}: missing required variable` : `${name}: ${issue.message}`;
  });
  throw new EnvValidationError(issues);
}

/**
 * Loads `.env` (if present) and validates it. Aborts the process with a clear
 * message when the configuration is invalid.
 */
export function loadEnv(): Env {
  dotenv.config({ quiet: true });
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}
