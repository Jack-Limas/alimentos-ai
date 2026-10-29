import type { FastifyError, FastifyPluginCallback, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError, type AiErrorCategory, type ErrorCode } from '../shared/errors/index.js';

export interface ErrorHandlerOptions {
  /** When true, internal error messages are never sent to clients. */
  isProduction: boolean;
}

interface ErrorBody {
  error: { code: ErrorCode; category?: AiErrorCategory; message: string; retryAfterSec?: number };
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
};

function send(
  reply: FastifyReply,
  statusCode: number,
  code: ErrorCode,
  message: string,
  category?: AiErrorCategory,
  retryAfterSec?: number,
): FastifyReply {
  const body: ErrorBody = { error: category ? { code, category, message } : { code, message } };
  if (retryAfterSec !== undefined) {
    body.error.retryAfterSec = retryAfterSec;
    void reply.header('Retry-After', String(retryAfterSec));
  }
  return reply.status(statusCode).send(body);
}

function zodMessage(error: ZodError): string {
  const issues = error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
  return `Invalid request: ${issues.join('; ')}`;
}

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error && 'statusCode' in error;
}

const errorHandlerPlugin: FastifyPluginCallback<ErrorHandlerOptions> = (app, options, done) => {
  app.setNotFoundHandler((request, reply) =>
    send(reply, 404, 'NOT_FOUND', `Route ${request.method} ${request.url} not found`),
  );

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof AppError) {
      return send(
        reply,
        error.statusCode,
        error.code,
        error.message,
        error.category,
        error.retryAfterSec,
      );
    }

    if (error instanceof ZodError) {
      return send(reply, 400, 'VALIDATION_ERROR', zodMessage(error));
    }

    const statusCode = isFastifyError(error) ? (error.statusCode ?? 500) : 500;
    if (statusCode >= 400 && statusCode < 500) {
      const code = STATUS_TO_CODE[statusCode] ?? 'VALIDATION_ERROR';
      return send(reply, statusCode, code, (error as Error).message);
    }

    request.log.error({ err: error }, 'Unhandled error');
    // Stack traces are never sent; outside production the message helps debugging.
    const message =
      options.isProduction || !(error instanceof Error) ? 'Internal server error' : error.message;
    return send(reply, 500, 'INTERNAL_ERROR', message);
  });

  done();
};

export default fp(errorHandlerPlugin, { name: 'error-handler', fastify: '5.x' });
