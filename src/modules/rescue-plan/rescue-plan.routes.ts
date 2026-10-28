import type { FastifyPluginCallback } from 'fastify';
import type { RescuePlanController } from './rescue-plan.controller.js';

export interface RescuePlanRoutesOptions {
  controller: RescuePlanController;
}

/** POST /v1/rescue-plan (X-Internal-Key checked by the internal-auth plugin). */
export const rescuePlanRoutes: FastifyPluginCallback<RescuePlanRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.post('/rescue-plan', options.controller.plan);
  done();
};
