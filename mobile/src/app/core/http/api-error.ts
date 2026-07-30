/**
 * The uniform error envelope every endpoint returns, per docs/CONTRACT.md.
 *
 * Clients branch on `code`, never on `message`: the text is Spanish prose meant
 * for humans and may be reworded or translated at any time, the code is the
 * stable contract.
 */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path: string;
}

/**
 * The codes the mobile client is expected to react to. Kept as a const object
 * rather than a TS `enum` so it survives `isolatedModules` and erases cleanly.
 */
export const ApiErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** No token, expired or invalid — this is the one that triggers a refresh. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  /** Returned for another user's task too: a 403 would confirm it exists. */
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/**
 * Narrows an unknown rejection reason to the envelope. Anything that fails this
 * check is a transport or parsing failure, not an API error, and must be handled
 * as such — a network drop on a mobile connection is routine, not exceptional.
 */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).statusCode === 'number'
  );
}
