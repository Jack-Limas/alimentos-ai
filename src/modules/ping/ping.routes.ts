import type { FastifyPluginCallback } from 'fastify';

const pingSchema = {
  response: {
    200: {
      type: 'object',
      properties: { pong: { type: 'boolean' } },
      required: ['pong'],
    },
  },
} as const;

/**
 * Temporary protected endpoint to verify X-Internal-Key end to end.
 * Replaced by the business /v1 endpoints in phase 3.
 */
export const pingRoutes: FastifyPluginCallback = (app, _options, done) => {
  app.get('/ping', { schema: pingSchema }, () => ({ pong: true }));
  done();
};
