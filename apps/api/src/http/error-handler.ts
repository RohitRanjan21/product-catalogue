import type { ErrorResponse } from '@catalogue/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError, ValidationError } from '../errors';

/**
 * The only place errors become HTTP responses. Every error body has the contract's
 * `{error: {code, message, details?}}` shape; stack traces and upstream bodies are logged, never sent.
 */
export function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
    const body: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        ...(error instanceof ValidationError ? { details: error.issues } : {}),
      },
    };
    return reply.status(error.statusCode).send(body);
  }

  // Fastify's own client errors: malformed JSON, body too large, unsupported content type.
  if (isClientError(error)) {
    const body: ErrorResponse = { error: { code: 'BAD_REQUEST', message: error.message } };
    return reply.status(error.statusCode).send(body);
  }

  request.log.error({ err: error }, 'Unhandled error');
  const body: ErrorResponse = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };
  return reply.status(500).send(body);
}

export function handleNotFound(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const body: ErrorResponse = { error: { code: 'NOT_FOUND', message: 'Route not found' } };
  return reply.status(404).send(body);
}

function isClientError(error: unknown): error is Error & { statusCode: number } {
  if (!(error instanceof Error) || !('statusCode' in error)) return false;
  const { statusCode } = error;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;
}
