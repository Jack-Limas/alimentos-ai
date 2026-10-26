import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { readAppInfo, type AppInfo } from './config/app-info.js';
import type { Env } from './config/env.js';
import { buildLoggerOptions } from './config/logger.js';
import {
  createHealthController,
  createHealthService,
  healthRoutes,
} from './modules/health/index.js';
import { pingRoutes } from './modules/ping/index.js';
import errorHandler from './plugins/error-handler.js';
import internalAuth from './plugins/internal-auth.js';
import security from './plugins/security.js';

export const PROTECTED_PREFIX = '/v1';

export interface AppDeps {
  env: Pick<Env, 'NODE_ENV' | 'AI_INTERNAL_KEY' | 'GEMINI_API_KEY' | 'GEMINI_MODEL'>;
  appInfo?: AppInfo;
  logger?: NonNullable<FastifyServerOptions['logger']>;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env } = deps;

  const app = Fastify({
    logger: deps.logger ?? buildLoggerOptions(env.NODE_ENV),
    // Render terminates TLS in a proxy; trust it for request.ip and protocol.
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(errorHandler, { isProduction: env.NODE_ENV === 'production' });
  await app.register(security);
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
  await app.register(pingRoutes, { prefix: PROTECTED_PREFIX });

  return app;
}
