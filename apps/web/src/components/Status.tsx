import { ApiError } from '../api/client';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  );
}

/** Shows the API's own (client-safe) message, or a generic one for anything unexpected. */
export function ErrorNotice({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
  return (
    <p className="notice notice--error" role="alert">
      {message}
    </p>
  );
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NOT_FOUND';
}
