import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '../shared/errors/index.js';

export const INTERNAL_KEY_HEADER = 'x-internal-key';

export interface InternalAuthOptions {
  /** Expected value of X-Internal-Key (AI_INTERNAL_KEY). */
  internalKey: string;
  /** Every path equal to or below this prefix requires the key. */
  protectedPrefix: string;
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Compares both values through their SHA-256 digests: the buffers always have
 * the same length, so timingSafeEqual never throws and the key length does not
 * leak through timing.
 */
export function isValidInternalKey(provided: string | undefined, expectedHash: Buffer): boolean {
  const providedHash = sha256(provided ?? '');
  return timingSafeEqual(providedHash, expectedHash) && provided !== undefined;
}

function isProtectedPath(url: string, prefix: string): boolean {
  const path = url.split('?', 1)[0] ?? '';
  return path === prefix || path.startsWith(`${prefix}/`);
}

const internalAuthPlugin: FastifyPluginCallback<InternalAuthOptions> = (app, options, done) => {
  const expectedHash = sha256(options.internalKey);

  // Runs at the root so unknown routes under the prefix also answer 401, not 404.
  app.addHook('onRequest', (request, _reply, hookDone) => {
    if (!isProtectedPath(request.url, options.protectedPrefix)) {
      hookDone();
      return;
    }

    const header = request.headers[INTERNAL_KEY_HEADER];
    const provided = typeof header === 'string' ? header : undefined;
    if (!isValidInternalKey(provided, expectedHash)) {
      // Same response for missing and wrong keys; the key is never logged.
      request.log.warn('Rejected request without a valid internal key');
      hookDone(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid internal key'));
      return;
    }

    hookDone();
  });

  done();
};

export default fp(internalAuthPlugin, { name: 'internal-auth', fastify: '5.x' });
