import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_INTERNAL_KEY } from './helpers/test-app.js';

const unauthorized = {
  error: { code: 'UNAUTHORIZED', message: 'Missing or invalid internal key' },
};

const briefing = { locale: 'es', role: 'OPERATOR', alerts: [], pendingOrders: [], kpis: {} };

/** Calls a protected endpoint (POST /v1/briefing with a valid body) with the given headers. */
async function ping(headers: Record<string, string> = {}, url = '/v1/briefing') {
  const app = await buildTestApp();
  const res = await app.inject({ method: 'POST', url, headers, payload: briefing });
  await app.close();
  return res;
}

describe('X-Internal-Key protection on /v1', () => {
  it('returns 401 without the header', async () => {
    const res = await ping();

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(unauthorized);
  });

  it('returns 401 with a wrong key of the same length', async () => {
    const wrongKey = `${TEST_INTERNAL_KEY.slice(0, -1)}X`;

    const res = await ping({ 'x-internal-key': wrongKey });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(unauthorized);
  });

  it('returns 401 with a key of a different length', async () => {
    const res = await ping({ 'x-internal-key': 'short' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(unauthorized);
  });

  it('returns 200 with the correct key', async () => {
    const res = await ping({ 'x-internal-key': TEST_INTERNAL_KEY });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ summary: string }>().summary).toBe('Resumen de prueba.');
  });

  it('protects unknown routes under /v1 too', async () => {
    const res = await ping({}, '/v1/unknown');

    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for unknown /v1 routes once authenticated', async () => {
    const res = await ping({ 'x-internal-key': TEST_INTERNAL_KEY }, '/v1/unknown');

    expect(res.statusCode).toBe(404);
  });

  it('does not echo the provided key in the response', async () => {
    const res = await ping({ 'x-internal-key': 'attacker-supplied-value' });

    expect(res.body).not.toContain('attacker-supplied-value');
  });
});
