import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
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

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
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
  } else {
    logger.error({ err }, 'Unhandled error');
    error = new ApiError(500, 'INTERNAL', 'Something went wrong');
  }
  res.status(error.status).json({ error: { code: error.code, message: error.message } });
};
