import type { FastifyRequest } from 'fastify';
import type { AiMeta } from '../ai-common/index.js';
import { rescuePlanInputSchema, type RescuePlan } from './rescue-plan.schemas.js';
import type { RescuePlanService } from './rescue-plan.service.js';

export interface RescuePlanController {
  plan: (request: FastifyRequest) => Promise<RescuePlan & { meta: AiMeta }>;
}

export function createRescuePlanController(service: RescuePlanService): RescuePlanController {
  return {
    plan: (request) => service.plan(rescuePlanInputSchema.parse(request.body), request.log),
  };
}
