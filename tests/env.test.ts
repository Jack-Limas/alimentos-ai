import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../src/config/env.js';
import { TEST_INTERNAL_KEY } from './helpers/test-app.js';

const validEnv = { NODE_ENV: 'test', AI_INTERNAL_KEY: TEST_INTERNAL_KEY };

describe('parseEnv', () => {
  it('defaults PORT to 4100', () => {
    expect(parseEnv(validEnv).PORT).toBe(4100);
  });

  it('names the missing variable when AI_INTERNAL_KEY is absent', () => {
    expect(() => parseEnv({ NODE_ENV: 'test' })).toThrow(EnvValidationError);
    expect(() => parseEnv({ NODE_ENV: 'test' })).toThrow(
      /AI_INTERNAL_KEY: missing required variable/,
    );
  });

  it('rejects an AI_INTERNAL_KEY shorter than 32 characters without echoing it', () => {
    const shortKey = 'too-short-secret';

    expect(() => parseEnv({ ...validEnv, AI_INTERNAL_KEY: shortKey })).toThrow(/at least 32/);
    expect(() => parseEnv({ ...validEnv, AI_INTERNAL_KEY: shortKey })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(shortKey) as unknown }),
    );
  });

  it('treats empty values as unset', () => {
    const env = parseEnv({ ...validEnv, PORT: '', GEMINI_API_KEY: '', GEMINI_MODEL: ' ' });

    expect(env.PORT).toBe(4100);
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBeUndefined();
  });

  it('treats an empty AI_INTERNAL_KEY as missing', () => {
    expect(() => parseEnv({ ...validEnv, AI_INTERNAL_KEY: '' })).toThrow(
      /AI_INTERNAL_KEY: missing required variable/,
    );
  });
});
