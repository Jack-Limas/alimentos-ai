export {
  createProposalExplanationController,
  type ProposalExplanationController,
} from './proposal-explanation.controller.js';
export {
  proposalExplanationRoutes,
  type ProposalExplanationRoutesOptions,
} from './proposal-explanation.routes.js';
export {
  proposalExplanationInputSchema,
  type ProposalExplanation,
  type ProposalExplanationInput,
} from './proposal-explanation.schemas.js';
export {
  createProposalExplanationService,
  findTies,
  sanitizeTieBreakOrder,
  TIE_THRESHOLD,
  type ProposalExplanationService,
} from './proposal-explanation.service.js';
