import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../shared/errors/index.js';

/** 30 requests per minute and source IP on /v1 (defence in depth behind the internal key). */
export const RATE_LIMIT = { max: 30, windowMs: 60_000 } as const;

export interface RateLimitOptions {
  /** Every path equal to or below this prefix is limited. */
  prefix: string;
  max?: number;
  windowMs?: number;
  now?: () => number;
}

interface Window {
  startedAt: number;
  count: number;
}

/**
 * Fixed window per IP, in memory (one process on Render). Runs before the
 * internal key check, so guessing the key is limited too. Windows that ended
 * are dropped as the map grows, so memory stays bounded.
 */
export function createRateLimiter({
  max = RATE_LIMIT.max,
  windowMs = RATE_LIMIT.windowMs,
  now = Date.now,
}: Omit<RateLimitOptions, 'prefix'> = {}) {
  const windows = new Map<string, Window>();

  const sweep = (at: number) => {
    for (const [key, window] of windows) {
      if (at - window.startedAt >= windowMs) windows.delete(key);
    }
  };

  return {
    /** null when allowed; otherwise the seconds until the window resets. */
    hit(key: string): number | null {
      const at = now();
      if (windows.size > 1_000) sweep(at);
      const current = windows.get(key);
      if (!current || at - current.startedAt >= windowMs) {
        windows.set(key, { startedAt: at, count: 1 });
        return null;
      }
      current.count += 1;
      if (current.count <= max) return null;
      return Math.max(1, Math.ceil((current.startedAt + windowMs - at) / 1000));
    },
    size: () => windows.size,
  };
}

const rateLimitPlugin: FastifyPluginCallback<RateLimitOptions> = (app, options, done) => {
  const limiter = createRateLimiter(options);
  app.addHook('onRequest', (request, _reply, hookDone) => {
    const path = request.url.split('?', 1)[0] ?? '';
    if (path !== options.prefix && !path.startsWith(`${options.prefix}/`)) {
      hookDone();
      return;
    }
    const retryAfterSec = limiter.hit(request.ip);
    if (retryAfterSec === null) {
      hookDone();
      return;
    }
    request.log.warn('Rate limit exceeded on /v1');
    hookDone(
      new AppError(
        429,
        'TOO_MANY_REQUESTS',
        'Too many requests, try again later',
        undefined,
        retryAfterSec,
      ),
    );
  });
  done();
};

export default fp(rateLimitPlugin, { name: 'rate-limit', fastify: '5.x' });
