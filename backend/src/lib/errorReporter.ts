import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { env } from '../env';
import { safeError } from './scrub';

// Error reports (SECURITY_PLAN S0.10, B12.1): the moment there is a SENTRY_DSN, unexpected
// errors go to Sentry. No SDK on purpose: this small sender decides exactly what leaves
// the server, and that is only the scrubbed error, the route's pattern (no ids), the
// release and the environment. Never headers, bodies, query strings, users or IPs.
// Blank SENTRY_DSN = nothing is sent. A failed report never affects the request.

type Dsn = { envelopeUrl: string; publicKey: string; raw: string };

function parseDsn(raw: string | undefined): Dsn | undefined {
  if (!raw) return undefined;
  const url = new URL(raw);
  const project = url.pathname.replace(/^\//, '');
  return { envelopeUrl: `${url.protocol}//${url.host}/api/${project}/envelope/`, publicKey: url.username, raw };
}

const dsn = parseDsn(env.SENTRY_DSN);
const REPEAT_MS = 60_000;
const lastSent = new Map<string, number>();

function reportedRecently(fingerprint: string) {
  const now = Date.now();
  if ((lastSent.get(fingerprint) ?? 0) > now - REPEAT_MS) return true;
  if (lastSent.size > 500) lastSent.clear();
  lastSent.set(fingerprint, now);
  return false;
}

/** `where`: the route pattern or the job's name. The same error is sent once a minute at most. */
export async function reportError(error: unknown, where: string) {
  if (!dsn) return;
  const safe = safeError(error);
  if (reportedRecently(`${where}|${safe.type}|${safe.message}`)) return;
  const eventId = randomUUID().replaceAll('-', '');
  const frames = (safe.stack ?? '').split('\n').filter(Boolean).reverse().map(line => ({ function: line.trim() }));
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: env.NODE_ENV,
    release: process.env.RELEASE ?? 'unknown',
    transaction: where,
    exception: { values: [{ type: safe.type, value: safe.message, stacktrace: { frames } }] },
    tags: safe.code ? { code: safe.code } : {},
  };
  const body = [JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: dsn.raw }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
  await fetch(dsn.envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=sahla-backend/1.0, sentry_key=${dsn.publicKey}`,
    },
    body,
    signal: AbortSignal.timeout(3000),
  }).catch(() => undefined);
}

/** The route's pattern ("/orders/:id"), never the real path with its ids and tokens. */
export const routeOf = (req: Request) => `${req.method} ${req.route?.path ?? 'no route'}`;
