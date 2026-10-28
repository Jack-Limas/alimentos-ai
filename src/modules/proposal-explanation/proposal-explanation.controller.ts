import type { FastifyRequest } from 'fastify';
import type { AiMeta } from '../ai-common/index.js';
import type { ProposalExplanation } from './proposal-explanation.schemas.js';
import { proposalExplanationInputSchema } from './proposal-explanation.schemas.js';
import type { ProposalExplanationService } from './proposal-explanation.service.js';

export interface ProposalExplanationController {
  explain: (request: FastifyRequest) => Promise<ProposalExplanation & { meta: AiMeta }>;
}

export function createProposalExplanationController(
  service: ProposalExplanationService,
): ProposalExplanationController {
  return {
    explain: (request) =>
      service.explain(proposalExplanationInputSchema.parse(request.body), request.log),
  };
}
