import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { env } from '../env';

// Structured logs (BACKEND_PLAN B12.1): one JSON line per request in production
// (the host collects them), readable lines in development, nothing in tests.
// Never logged: the query string (GPS coordinates, search words, card-check
// refs), headers (tokens), bodies (passwords, PINs, messages).

export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
  ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname', singleLine: true } } }),
});

export const requestLogger = pinoHttp({
  logger,
  serializers: {
    req: req => ({ id: req.id, method: req.method, path: String(req.url).split('?')[0] }),
    res: res => ({ status: res.statusCode }),
  },
  // Health checks every few seconds from the host's monitor would drown the rest.
  autoLogging: { ignore: req => req.url === '/v1/health' },
  customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
});
