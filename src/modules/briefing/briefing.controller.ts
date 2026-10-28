import type { FastifyRequest } from 'fastify';
import type { AiMeta } from '../ai-common/index.js';
import { briefingInputSchema, type Briefing } from './briefing.schemas.js';
import type { BriefingService } from './briefing.service.js';

export interface BriefingController {
  brief: (request: FastifyRequest) => Promise<Briefing & { meta: AiMeta }>;
}

export function createBriefingController(service: BriefingService): BriefingController {
  return {
    brief: (request) => service.brief(briefingInputSchema.parse(request.body), request.log),
  };
}
