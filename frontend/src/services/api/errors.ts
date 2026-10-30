// One error type for every service, mock or HTTP. Screens show
// `t(errorMessageKey(error))`; codes match the API contract (docs/API.md).

export type ApiErrorCode =
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_PIN'
  | 'INVALID_CODE'
  | 'FORBIDDEN'
  | 'ITEM_UNAVAILABLE'
  | 'OPEN_ORDERS'
  | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string = code,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const KNOWN: ApiErrorCode[] = [
  'NETWORK',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'VALIDATION',
  'EMAIL_TAKEN',
  'INVALID_CREDENTIALS',
  'INVALID_PIN',
  'INVALID_CODE',
  'FORBIDDEN',
  'ITEM_UNAVAILABLE',
  'OPEN_ORDERS',
];

/** i18n key for an error's user-facing message (src/i18n: errors.*). */
export function errorMessageKey(error: unknown): `errors.${ApiErrorCode}` {
  const code =
    error instanceof ApiError && KNOWN.includes(error.code)
      ? error.code
      : 'UNKNOWN';
  return `errors.${code}`;
}
