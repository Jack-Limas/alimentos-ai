import type { FastifyPluginCallback } from 'fastify';
import type { ProposalExplanationController } from './proposal-explanation.controller.js';

export interface ProposalExplanationRoutesOptions {
  controller: ProposalExplanationController;
}

/** POST /v1/proposal-explanation (X-Internal-Key checked by the internal-auth plugin). */
export const proposalExplanationRoutes: FastifyPluginCallback<ProposalExplanationRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.post('/proposal-explanation', options.controller.explain);
  done();
};
