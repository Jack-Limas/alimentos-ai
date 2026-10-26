import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../src/shared/errors/index.js';
import { buildTestApp } from './helpers/test-app.js';

async function buildAppWithFailingRoutes(nodeEnv: 'test' | 'production' = 'test') {
  const app = await buildTestApp({ env: { NODE_ENV: nodeEnv } });
  app.get('/ai-timeout', () => {
    throw AppError.ai('TIMEOUT', 'Gemini did not answer in time');
  });
  app.get('/zod-error', () => {
    z.object({ locale: z.enum(['es', 'en']) }).parse({ locale: 'fr' });
  });
  app.get('/crash', () => {
    throw new Error('upstream secret detail');
  });
  return app;
}

describe('error handler', () => {
  it('serializes AI errors with code, category and suggested status', async () => {
    const app = await buildAppWithFailingRoutes();

    const res = await app.inject({ method: 'GET', url: '/ai-timeout' });

    expect(res.statusCode).toBe(504);
    expect(res.json()).toEqual({
      error: { code: 'TIMEOUT', category: 'TIMEOUT', message: 'Gemini did not answer in time' },
    });
    await app.close();
  });

  it('maps Zod errors to 400 VALIDATION_ERROR', async () => {
    const app = await buildAppWithFailingRoutes();

    const res = await app.inject({ method: 'GET', url: '/zod-error' });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('hides internal messages in production and never sends a stack', async () => {
    const app = await buildAppWithFailingRoutes('production');

    const res = await app.inject({ method: 'GET', url: '/crash' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(res.body).not.toContain('secret');
    await app.close();
  });
});
