import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_INTERNAL_KEY } from './helpers/test-app.js';

describe('GET /health', () => {
  it('returns 200 without an internal key', async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ok',
      service: 'alimentos-ai',
      version: '0.0.0-test',
      model: null,
      geminiConfigured: false,
    });
    await app.close();
  });

  it('reports the model and whether Gemini is configured', async () => {
    const app = await buildTestApp({
      env: { GEMINI_MODEL: 'gemini-test-model', GEMINI_API_KEY: 'fake-gemini-key-value' },
    });

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.json()).toMatchObject({ model: 'gemini-test-model', geminiConfigured: true });
    expect(res.body).not.toContain('fake-gemini-key-value');
    await app.close();
  });

  it('never contains the internal key value', async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-internal-key': TEST_INTERNAL_KEY },
    });

    expect(res.body).not.toContain(TEST_INTERNAL_KEY);
    expect(JSON.stringify(res.headers)).not.toContain(TEST_INTERNAL_KEY);
    await app.close();
  });
});

describe('not found', () => {
  it('returns 404 with the error format', async () => {
    const app = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) as unknown },
    });
    await app.close();
  });
});
