import type { FastifyPluginCallback } from 'fastify';
import type { BriefingController } from './briefing.controller.js';

export interface BriefingRoutesOptions {
  controller: BriefingController;
}

/** POST /v1/briefing (X-Internal-Key checked by the internal-auth plugin). */
export const briefingRoutes: FastifyPluginCallback<BriefingRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.post('/briefing', options.controller.brief);
  done();
};
