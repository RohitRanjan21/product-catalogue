import type { ErrorCode, ValidationIssue } from '@catalogue/contracts';

/**
 * Base for errors the API knows how to report. `message` is safe to show to clients;
 * internal detail (upstream status, library errors) goes in `cause`, which is logged but never sent.
 */
export abstract class AppError extends Error {
  protected constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    readonly issues: ValidationIssue[],
    message = 'The request is invalid',
  ) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(429, 'RATE_LIMITED', message);
  }
}

/** A dependency we call (product source, email provider) failed or answered with nonsense. */
export class UpstreamError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(502, 'UPSTREAM_ERROR', message, options);
  }
}
