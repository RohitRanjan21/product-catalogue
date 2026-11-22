import { ErrorResponseSchema, type ErrorCode, type ValidationIssue } from '@catalogue/contracts';
import type { z } from 'zod';

/** Codes from the API contract, plus the two failures that happen before we get a contract response. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/**
 * The only place the web app makes HTTP calls, and only to our own `/api` (never to a product source).
 * Responses are parsed with the shared contract, so API drift shows up as a clear error, not a blank page.
 */
export async function apiRequest<T extends z.ZodType>(
  path: `/api/${string}`,
  schema: T,
  init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetch(new URL(path, window.location.origin), {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'We could not reach the server. Check your connection and try again.');
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = ErrorResponseSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(response.status, code, message, details);
    }
    throw new ApiError(response.status, 'INTERNAL_ERROR', GENERIC_MESSAGE);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(response.status, 'INVALID_RESPONSE', GENERIC_MESSAGE);
  return parsed.data;
}
