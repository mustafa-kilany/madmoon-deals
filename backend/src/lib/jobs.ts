// Background jobs, inside this server process (BACKEND_PLAN B5.3). Enough while
// there is one server: nothing here must survive a restart (a lost risk check is
// caught by the nightly run). With several servers (B12), move to a queue on the
// same PostgreSQL such as pg-boss, behind these same functions.

import { env } from '../env';
import { reportError } from './errorReporter';
import { logger } from './logger';

const waiting = new Map<string, { timer?: ReturnType<typeof setTimeout>; run: () => Promise<unknown> }>();
const running = new Set<Promise<unknown>>();

function start(key: string, job: () => Promise<unknown>) {
  const run = job()
    .catch(error => {
      logger.error({ err: error, job: key.split(':')[0] }, 'Job failed');
      void reportError(error, `job ${key.split(':')[0]}`);
    })
    .finally(() => running.delete(run));
  running.add(run);
}

/**
 * Runs `job` a moment after the request answered. The same key queued again
 * before then runs once (e.g. ten listings in a row → one risk check).
 */
export function runSoon(key: string, job: () => Promise<unknown>, delayMs = 2000) {
  if (waiting.has(key)) return;
  // Tests run jobs only with flushJobs(), so nothing runs after a test file's clean-up.
  const timer =
    env.NODE_ENV === 'test'
      ? undefined
      : setTimeout(() => {
          waiting.delete(key);
          start(key, job);
        }, delayMs);
  waiting.set(key, { timer, run: job });
}

/** Tests: run everything waiting now, and wait until all jobs have finished. */
export async function flushJobs() {
  for (const [key, { timer, run }] of waiting) {
    clearTimeout(timer);
    waiting.delete(key);
    start(key, run);
  }
  while (running.size) await Promise.all(running);
}

/** Once a day at `hour` o'clock Jordan time (UTC+3 all year), while the server is up. */
export function daily(name: string, hour: number, job: () => Promise<unknown>) {
  const next = () => {
    const now = Date.now();
    const at = new Date(now);
    at.setUTCHours(hour - 3, 0, 0, 0);
    if (at.getTime() <= now) at.setTime(at.getTime() + 86_400_000);
    setTimeout(() => {
      start(name, job);
      next();
    }, at.getTime() - now);
  };
  next();
}
