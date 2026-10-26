import type { FastifyPluginCallback } from 'fastify';
import type { HealthController } from './health.controller.js';

export interface HealthRoutesOptions {
  controller: HealthController;
}

// The response schema also acts as an allowlist: unknown fields are dropped.
const healthSchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        service: { type: 'string' },
        version: { type: 'string' },
        model: { type: ['string', 'null'] },
        geminiConfigured: { type: 'boolean' },
      },
      required: ['status', 'service', 'version', 'model', 'geminiConfigured'],
    },
  },
} as const;

export const healthRoutes: FastifyPluginCallback<HealthRoutesOptions> = (app, options, done) => {
  app.get('/health', { schema: healthSchema }, options.controller.status);
  done();
};
