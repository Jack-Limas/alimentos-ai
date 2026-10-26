import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../../src/app.js';

/** Fake 64-character key used only in tests. */
export const TEST_INTERNAL_KEY = 'test-internal-key-0123456789abcdef0123456789abcdef0123456789abcd';

type TestAppOverrides = Partial<Omit<AppDeps, 'env'>> & { env?: Partial<AppDeps['env']> };

export function buildTestApp(overrides: TestAppOverrides = {}): Promise<FastifyInstance> {
  const { env, ...rest } = overrides;
  return buildApp({
    appInfo: { name: 'alimentos-ai', version: '0.0.0-test' },
    logger: false,
    ...rest,
    env: { NODE_ENV: 'test', AI_INTERNAL_KEY: TEST_INTERNAL_KEY, ...env },
  });
}
