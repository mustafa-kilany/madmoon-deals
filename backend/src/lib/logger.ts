import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from '../env';
import { safeError, safePath } from './scrub';

// Structured logs (BACKEND_PLAN B12.1): one JSON line per request in production
// (the host collects them), readable lines in development, nothing in tests.
// Readable only in a terminal: a hosted test copy runs in development mode, its output is a pipe,
// and the image has no pino-pretty (a dev dependency), so asking for it there crashed the start.
// Never logged: the query string (GPS coordinates, search words, card-check
// refs), headers (tokens), bodies (passwords, PINs, messages).

export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
  // S7.8: every logged error goes through the scrubber (Prisma's messages quote personal data).
  serializers: { err: safeError },
  ...(env.NODE_ENV === 'development' && process.stdout.isTTY && { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname', singleLine: true } } }),
});

export const requestLogger = pinoHttp({
  logger,
  serializers: {
    req: req => ({ id: req.id, method: req.method, path: safePath(req.url) }),
    res: res => ({ status: res.statusCode }),
    err: safeError,
  },
  // Health checks every few seconds from the host's monitor would drown the rest.
  autoLogging: { ignore: req => req.url === '/v1/health' },
  customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
});
