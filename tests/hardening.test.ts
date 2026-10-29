import { describe, expect, it } from 'vitest';
import { BODY_LIMIT_BYTES } from '../src/app.js';
import { createRateLimiter, RATE_LIMIT } from '../src/plugins/rate-limit.js';
import { buildTestApp, TEST_INTERNAL_KEY } from './helpers/test-app.js';

const briefing = (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  ip: string,
  key = TEST_INTERNAL_KEY,
) =>
  app.inject({
    method: 'POST',
    url: '/v1/briefing',
    headers: { 'x-internal-key': key, 'x-forwarded-for': ip },
    payload: {},
  });

describe('rate limit on /v1', () => {
  it('allows 30 requests per minute and IP, then answers 429 with Retry-After', async () => {
    let clock = 0;
    const app = await buildTestApp({ rateLimit: { now: () => clock } });

    expect(RATE_LIMIT).toEqual({ max: 30, windowMs: 60_000 });
    for (let i = 0; i < 30; i += 1) {
      expect((await briefing(app, '198.51.100.7')).statusCode).not.toBe(429);
    }
    clock = 20_000;
    const limited = await briefing(app, '198.51.100.7');
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('40');
    expect(limited.json()).toMatchObject({
      error: { code: 'TOO_MANY_REQUESTS', retryAfterSec: 40 },
    });
    // Another IP has its own window; the first one recovers after the minute.
    expect((await briefing(app, '203.0.113.9')).statusCode).not.toBe(429);
    clock = 60_000;
    expect((await briefing(app, '198.51.100.7')).statusCode).not.toBe(429);
    await app.close();
  });

  it('counts attempts without a valid key too (limits guessing the key)', async () => {
    const app = await buildTestApp({ rateLimit: { max: 2, now: () => 0 } });
    expect((await briefing(app, '192.0.2.1', 'wrong')).statusCode).toBe(401);
    expect((await briefing(app, '192.0.2.1', 'wrong')).statusCode).toBe(401);
    expect((await briefing(app, '192.0.2.1', 'wrong')).statusCode).toBe(429);
    await app.close();
  });

  it('never limits /health (Render pings it)', async () => {
    const app = await buildTestApp({ rateLimit: { max: 1, now: () => 0 } });
    for (let i = 0; i < 5; i += 1) {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    }
    await app.close();
  });

  it('drops finished windows so memory stays bounded', () => {
    let clock = 0;
    const limiter = createRateLimiter({ now: () => clock });
    for (let i = 0; i < 1_001; i += 1)
      limiter.hit(`10.0.${String(Math.floor(i / 256))}.${String(i % 256)}`);
    expect(limiter.size()).toBe(1_001);
    clock = 61_000;
    limiter.hit('10.9.9.9');
    expect(limiter.size()).toBe(1);
  });
});

describe('body limit', () => {
  it('rejects bodies over 256 KB with 413 PAYLOAD_TOO_LARGE', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/briefing',
      headers: { 'x-internal-key': TEST_INTERNAL_KEY, 'content-type': 'application/json' },
      payload: JSON.stringify({ padding: 'x'.repeat(BODY_LIMIT_BYTES) }),
    });

    expect(BODY_LIMIT_BYTES).toBe(262_144);
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    await app.close();
  });
});
