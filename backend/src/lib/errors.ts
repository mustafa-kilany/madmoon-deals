import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { reportError, routeOf } from './errorReporter';
import { logger } from './logger';

// Error codes the app understands (docs/API.md → Error Codes Standard).
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'EMAIL_TAKEN'
  | 'ITEM_UNAVAILABLE'
  | 'OPEN_ORDERS'
  | 'INVALID_PIN'
  | 'PAYMENT_DECLINED' // 402: the card was declined; the buyer can try another
  | 'INVALID_CODE'
  | 'SANAD_UNAVAILABLE' // 503: ID verification with Sanad isn't switched on yet
  | 'EMAIL_UNAVAILABLE' // 503: the email service is down; the code wasn't sent, ask again
  | 'RATE_LIMITED' // 429: shown as a generic error by the app
  | 'INTERNAL';

// Throw one from any route: it becomes { error: { code, message } }.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = req => {
  throw new ApiError(404, 'NOT_FOUND', `No endpoint ${req.method} ${req.path}`);
};

/**
 * F3: text with a NUL byte can't be stored by PostgreSQL. Refused here, for the JSON
 * body, the query string and the path, instead of surfacing as a 500 in every route.
 */
function hasNul(body: unknown) {
  // A loop, not recursion: a body of 30 000 nested brackets must not overflow the stack.
  const waiting = [body];
  while (waiting.length) {
    const value = waiting.pop();
    if (typeof value === 'string') {
      if (value.includes('\u0000')) return true;
    } else if (Array.isArray(value)) {
      waiting.push(...value);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.includes('\u0000')) return true;
        waiting.push(child);
      }
    }
  }
  return false;
}

export const refuseNulBytes: RequestHandler = (req, _res, next) => {
  if (/%00/.test(req.originalUrl) || hasNul(req.body)) throw new ApiError(422, 'VALIDATION', 'The text has characters that aren’t allowed');
  next();
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let error: ApiError;
  if (err instanceof ApiError) {
    error = err;
  } else if (err instanceof ZodError) {
    error = new ApiError(422, 'VALIDATION', err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  } else if (err?.type === 'entity.parse.failed') {
    error = new ApiError(400, 'VALIDATION', 'Body is not valid JSON');
  } else if (err?.type === 'entity.too.large') {
    error = new ApiError(413, 'VALIDATION', 'Body is too large');
  } else if (err?.name === 'MulterError') {
    // Uploads: too big, a second file, or an unexpected field name.
    error = new ApiError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 422, 'VALIDATION', `Upload: ${err.message}`);
  } else if (err instanceof URIError || (typeof err?.status === 'number' && err.status >= 400 && err.status < 500)) {
    // A broken address (%E0%A4) or body the libraries refused: the caller's mistake, not ours.
    error = new ApiError(err?.status === 413 ? 413 : 400, 'VALIDATION', 'Bad request');
  } else {
    logger.error({ err }, 'Unhandled error');
    void reportError(err, routeOf(req));
    error = new ApiError(500, 'INTERNAL', 'Something went wrong');
  }
  res.status(error.status).json({ error: { code: error.code, message: error.message } });
};
