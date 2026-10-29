import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { readAppInfo, type AppInfo } from './config/app-info.js';
import type { Env } from './config/env.js';
import { buildLoggerOptions } from './config/logger.js';
import {
  createGoogleTransport,
  createJsonLlmClient,
  LlmError,
  type LlmClient,
  type LlmTransport,
} from './gemini/index.js';
import {
  briefingRoutes,
  createBriefingController,
  createBriefingService,
} from './modules/briefing/index.js';
import {
  createHealthController,
  createHealthService,
  healthRoutes,
} from './modules/health/index.js';
import {
  createProposalExplanationController,
  createProposalExplanationService,
  proposalExplanationRoutes,
} from './modules/proposal-explanation/index.js';
import {
  createRescuePlanController,
  createRescuePlanService,
  rescuePlanRoutes,
} from './modules/rescue-plan/index.js';
import errorHandler from './plugins/error-handler.js';
import internalAuth from './plugins/internal-auth.js';
import rateLimit from './plugins/rate-limit.js';
import security from './plugins/security.js';

export const PROTECTED_PREFIX = '/v1';
/** The largest input (a proposal explanation) is a few KB; 256 KB leaves room and no more. */
export const BODY_LIMIT_BYTES = 262_144;

export interface AppDeps {
  env: Pick<
    Env,
    'NODE_ENV' | 'AI_INTERNAL_KEY' | 'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'AI_UPSTREAM_TIMEOUT_MS'
  >;
  /** Defaults to Gemini through @google/genai. Tests inject a fake. */
  llm?: LlmClient;
  appInfo?: AppInfo;
  logger?: NonNullable<FastifyServerOptions['logger']>;
  /** Tests inject a clock or a smaller limit; production uses 30 per minute and IP. */
  rateLimit?: { max?: number; windowMs?: number; now?: () => number };
}

/** Used when GEMINI_API_KEY is missing: never reached, the client refuses first. */
const unconfiguredTransport: LlmTransport = () =>
  Promise.reject(
    new LlmError('INVALID_API_KEY', false, undefined, 'GEMINI_API_KEY is not configured'),
  );

function defaultLlm(env: AppDeps['env']): LlmClient {
  return createJsonLlmClient({
    transport: env.GEMINI_API_KEY
      ? createGoogleTransport(env.GEMINI_API_KEY)
      : unconfiguredTransport,
    model: env.GEMINI_MODEL ?? null,
    apiKeyConfigured: env.GEMINI_API_KEY !== undefined,
    timeoutMs: env.AI_UPSTREAM_TIMEOUT_MS,
  });
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env } = deps;

  const app = Fastify({
    logger: deps.logger ?? buildLoggerOptions(env.NODE_ENV),
    // Render terminates TLS in a proxy; trust it for request.ip and protocol.
    trustProxy: true,
    bodyLimit: BODY_LIMIT_BYTES,
  });

  await app.register(sensible);
  await app.register(errorHandler, { isProduction: env.NODE_ENV === 'production' });
  await app.register(security);
  // Before the key check: also limits attempts to guess AI_INTERNAL_KEY.
  await app.register(rateLimit, { prefix: PROTECTED_PREFIX, ...deps.rateLimit });
  await app.register(internalAuth, {
    internalKey: env.AI_INTERNAL_KEY,
    protectedPrefix: PROTECTED_PREFIX,
  });

  const appInfo = deps.appInfo ?? readAppInfo();
  const healthController = createHealthController(
    createHealthService({
      version: appInfo.version,
      geminiModel: env.GEMINI_MODEL,
      geminiConfigured: env.GEMINI_API_KEY !== undefined,
    }),
  );

  await app.register(healthRoutes, { controller: healthController });
  const llm = deps.llm ?? defaultLlm(env);
  await app.register(proposalExplanationRoutes, {
    prefix: PROTECTED_PREFIX,
    controller: createProposalExplanationController(createProposalExplanationService(llm)),
  });
  await app.register(rescuePlanRoutes, {
    prefix: PROTECTED_PREFIX,
    controller: createRescuePlanController(createRescuePlanService(llm)),
  });
  await app.register(briefingRoutes, {
    prefix: PROTECTED_PREFIX,
    controller: createBriefingController(createBriefingService(llm)),
  });

  return app;
}
