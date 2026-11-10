// Background jobs (BACKEND_PLAN B5.3, BACKEND_REVIEW M1): pushes, emails sent after the answer, risk
// checks. Each waits in the Job table, not in this server's memory, so a deploy or a crash loses
// nothing: any server takes it, and a failure is tried again later (5 tries, growing gaps). A job is a
// name plus JSON arguments, because a row can't hold a function: defineJob() registers what a name
// runs, at start-up, on every server.
//
// The same idea as pg-boss on the same PostgreSQL, in one table Prisma's migrations own and the tests
// can empty and flush. Several servers are safe: each job is taken by one (FOR UPDATE SKIP LOCKED).
// Daily jobs run on one server and catch up after downtime (LOAD_BALANCER_TEST_PLAN L2, review L7).

import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { env } from '../env';
import { reportError } from './errorReporter';
import { logger } from './logger';
import { safeError } from './scrub';

type Run = (args: unknown) => Promise<unknown>;
type JobRow = { id: string; name: string; args: unknown; attempts: number };

const handlers = new Map<string, Run>();
const MAX_ATTEMPTS = 5;
const RETRY_FIRST_MS = 30_000; // then 1, 2, 4 minutes
const LOCK_MS = 5 * 60_000; // a server that dies mid-job: another takes it over after this
const BATCH = 20;

/** Inserts still on their way to the database (a request doesn't wait for them). */
const queuing = new Set<Promise<unknown>>();
/** Tests: the jobs this process queued, the only ones flushJobs() runs. */
const queuedHere = new Set<string>();

/**
 * Registers what the job `name` runs. `soon(args, key?)` queues it to run a moment later; while a job
 * with the same `key` is still waiting, queuing it again does nothing (ten listings in a row → one
 * risk check). Arguments are stored as JSON: ids, not objects.
 */
export function defineJob<A extends object>(name: string, run: (args: A) => Promise<unknown>) {
  if (handlers.has(name)) throw new Error(`Two jobs are called ${name}`);
  handlers.set(name, run as Run);
  return {
    soon: (args: A, key?: string, delayMs = 2000) => queue(name, args, key, delayMs),
  };
}

function queue(name: string, args: object, key: string | undefined, delayMs: number) {
  const insert = prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Job" ("id", "name", "args", "key", "runAt")
    VALUES (${randomUUID()}, ${name}, ${JSON.stringify(args)}::jsonb, ${key ?? null}::text, ${new Date(Date.now() + delayMs)})
    ON CONFLICT ("key") DO NOTHING
    RETURNING "id"`
    .then(rows => {
      if (env.NODE_ENV === 'test') for (const row of rows) queuedHere.add(row.id);
    })
    .catch(error => {
      logger.error({ err: error, job: name }, 'Job not queued');
      void reportError(error, `queue ${name}`);
    })
    .finally(() => queuing.delete(insert));
  queuing.add(insert);
}

/** Takes due jobs (or the given ones) for this server: locked, counted, and their key freed for new events. */
async function take(ids?: string[]) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_MS);
  return ids
    ? prisma.$queryRaw<JobRow[]>`
        UPDATE "Job" SET "lockedUntil" = ${lockedUntil}, "attempts" = "attempts" + 1, "key" = NULL
        WHERE "id" IN (
          SELECT "id" FROM "Job" WHERE "id" = ANY(${ids}) AND "failedAt" IS NULL
            AND ("lockedUntil" IS NULL OR "lockedUntil" < ${now})
          FOR UPDATE SKIP LOCKED)
        RETURNING "id", "name", "args", "attempts"`
    : prisma.$queryRaw<JobRow[]>`
        UPDATE "Job" SET "lockedUntil" = ${lockedUntil}, "attempts" = "attempts" + 1, "key" = NULL
        WHERE "id" IN (
          SELECT "id" FROM "Job" WHERE "runAt" <= ${now} AND "failedAt" IS NULL
            AND ("lockedUntil" IS NULL OR "lockedUntil" < ${now})
          ORDER BY "runAt" LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED)
        RETURNING "id", "name", "args", "attempts"`;
}

async function runOne(job: JobRow) {
  try {
    const run = handlers.get(job.name);
    if (!run) throw new Error(`No job is called ${job.name}`);
    await run(job.args);
    await prisma.job.delete({ where: { id: job.id } });
  } catch (error) {
    const last = job.attempts >= MAX_ATTEMPTS;
    logger.error({ err: error, job: job.name, attempt: job.attempts }, last ? 'Job failed for good' : 'Job failed, will try again');
    if (last) void reportError(error, `job ${job.name}`);
    const { type, message } = safeError(error);
    await prisma.job
      .update({
        where: { id: job.id },
        data: {
          lockedUntil: null,
          lastError: `${type}: ${message}`.slice(0, 500),
          ...(last ? { failedAt: new Date() } : { runAt: new Date(Date.now() + RETRY_FIRST_MS * 2 ** (job.attempts - 1)) }),
        },
      })
      .catch(updateError => logger.error({ err: updateError }, 'Couldn’t record a failed job'));
  }
}

/** Every server: runs due jobs, checking once a second. Returns a stop function. */
export function startJobWorker(everyMs = 1000) {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    take()
      .then(jobs => Promise.all(jobs.map(runOne)))
      .catch(error => logger.warn({ err: error }, 'Jobs: couldn’t take any')) // the database is away: next time
      .finally(() => (busy = false));
  }, everyMs);
  (timer as unknown as { unref(): void }).unref();
  return () => clearInterval(timer);
}

/** Tests: run every job this process queued now, and what those queue in turn, until none are left. */
export async function flushJobs() {
  for (;;) {
    while (queuing.size) await Promise.all(queuing);
    const ids = [...queuedHere];
    queuedHere.clear();
    if (!ids.length) return;
    await Promise.all((await take(ids)).map(runOne));
  }
}

// ── Daily jobs ──

const running = new Set<Promise<unknown>>();
function start(name: string, job: () => Promise<unknown>) {
  const run = job()
    .catch(error => {
      logger.error({ err: error, job: name }, 'Job failed');
      void reportError(error, `job ${name}`);
    })
    .finally(() => running.delete(run));
  running.add(run);
}

/** The Jordan date (UTC+3 all year) of a moment: 2026-11-10. */
const jordanDay = (at: Date) => new Date(at.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Runs `job` as `name`'s run for the day of `at`, unless another server already started it:
 * the first to write the JobRun row runs it, the others skip. True if this server ran it.
 */
export async function runDaily(name: string, at: Date, job: () => Promise<unknown>) {
  const claimed = await prisma.$executeRaw`
    INSERT INTO "JobRun" ("name", "day") VALUES (${name}, ${jordanDay(at)}) ON CONFLICT DO NOTHING`;
  if (!claimed) {
    logger.info({ job: name }, 'Another server runs it today');
    return false;
  }
  await job();
  return true;
}

/** The last time `hour` o'clock Jordan time came, at or before `now`. */
export function lastTime(hour: number, now = new Date()) {
  const at = new Date(now);
  at.setUTCHours(hour - 3, 0, 0, 0);
  if (at.getTime() > now.getTime()) at.setTime(at.getTime() - 86_400_000);
  return at;
}

/**
 * Once a day at `hour` o'clock Jordan time (UTC+3 all year), on one of the servers that are up.
 * A server starting after that hour runs today's if nobody did (all were down or restarting then).
 */
export function daily(name: string, hour: number, job: () => Promise<unknown>) {
  start(name, () => runDaily(name, lastTime(hour), job));
  const next = () => {
    const at = new Date(lastTime(hour).getTime() + 86_400_000);
    setTimeout(() => {
      start(name, () => runDaily(name, at, job));
      next();
    }, at.getTime() - Date.now());
  };
  next();
}
