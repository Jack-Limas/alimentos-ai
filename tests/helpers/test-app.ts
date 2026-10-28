import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../../src/app.js';
import { createFakeLlm } from './fake-llm.js';

/** Fake 64-character key used only in tests. */
export const TEST_INTERNAL_KEY = 'test-internal-key-0123456789abcdef0123456789abcdef0123456789abcd';

type TestAppOverrides = Partial<Omit<AppDeps, 'env'>> & { env?: Partial<AppDeps['env']> };

export function buildTestApp(overrides: TestAppOverrides = {}): Promise<FastifyInstance> {
  const { env, ...rest } = overrides;
  return buildApp({
    appInfo: { name: 'alimentos-ai', version: '0.0.0-test' },
    logger: false,
    // Never Google in tests: a fake that answers every endpoint unless overridden.
    llm: createFakeLlm(),
    ...rest,
    env: {
      NODE_ENV: 'test',
      AI_INTERNAL_KEY: TEST_INTERNAL_KEY,
      AI_UPSTREAM_TIMEOUT_MS: 12_000,
      ...env,
    },
  });
}
