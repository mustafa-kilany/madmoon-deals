// Background jobs (BACKEND_REVIEW M1, L7; LOAD_BALANCER_TEST_PLAN L2): they wait in the database, so a
// restart loses nothing; a failure is tried again; several servers run each job once; a daily job runs
// on one server, and catches up when every server was down at its hour.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from '../db';
import { defineJob, flushJobs, lastTime, runDaily, startJobWorker } from './jobs';

const NAME = 'e2e daily job';
const clear = async () => {
  await prisma.jobRun.deleteMany({ where: { name: NAME } });
  await prisma.job.deleteMany({}); // only this file's jobs run while it does (one test file at a time)
};
before(clear);
after(async () => {
  await clear();
  await prisma.$disconnect();
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const until = async (what: string, ok: () => boolean | Promise<boolean>, ms = 10_000) => {
  const started = Date.now();
  while (!(await ok())) {
    if (Date.now() - started > ms) assert.fail(`Waited ${ms} ms for: ${what}`);
    await sleep(20);
  }
};

// ── Queued work ──

const seen: string[] = [];
const record = defineJob('e2e record', async ({ value }: { value: string }) => void seen.push(value));
let failuresLeft = 0;
const flaky = defineJob('e2e flaky', async ({ value }: { value: string }) => {
  if (failuresLeft-- > 0) throw new Error('the email service is down');
  seen.push(value);
});

test('a queued job waits in the database, not in memory: a restart loses nothing', async () => {
  seen.length = 0;
  record.soon({ value: 'after the restart' }, undefined, 0);
  await until('the row', async () => (await prisma.job.count({ where: { name: 'e2e record' } })) === 1);
  // A "new server" (nothing of the first one's memory involved) finds it and runs it.
  const stop = startJobWorker(20);
  try {
    await until('it ran', () => seen.includes('after the restart'));
    await until('it is gone once done', async () => (await prisma.job.count({ where: { name: 'e2e record' } })) === 0);
  } finally {
    stop();
  }
});

test('the same key while one is waiting: it runs once', async () => {
  seen.length = 0;
  for (let i = 0; i < 5; i++) record.soon({ value: `listing ${i}` }, 'e2e:risk:same-person');
  await flushJobs();
  assert.deepEqual(seen, ['listing 0']);
  // Once it ran, the key is free again.
  record.soon({ value: 'later' }, 'e2e:risk:same-person');
  await flushJobs();
  assert.deepEqual(seen, ['listing 0', 'later']);
});

test('a job that fails is tried again later, then given up after 5 tries, with the reason kept', async () => {
  seen.length = 0;
  failuresLeft = 1;
  flaky.soon({ value: 'second try' }, undefined, 0);
  await flushJobs();
  const waiting = await prisma.job.findFirstOrThrow({ where: { name: 'e2e flaky' } });
  assert.equal(waiting.attempts, 1);
  assert.equal(waiting.failedAt, null);
  assert.match(waiting.lastError ?? '', /email service is down/);
  assert.ok(waiting.runAt.getTime() > Date.now() + 20_000, 'tried again after a pause, not at once');
  await prisma.job.update({ where: { id: waiting.id }, data: { runAt: new Date() } });
  const stop = startJobWorker(20);
  try {
    await until('the second try', () => seen.includes('second try'));
  } finally {
    stop();
  }

  failuresLeft = 99;
  flaky.soon({ value: 'never' }, undefined, 0);
  await until('queued', async () => (await prisma.job.count({ where: { name: 'e2e flaky' } })) === 1);
  const stop2 = startJobWorker(20);
  try {
    for (let i = 0; i < 5; i++) {
      await prisma.job.updateMany({ where: { name: 'e2e flaky', failedAt: null }, data: { runAt: new Date() } });
      await until(`try ${i + 1}`, async () => (await prisma.job.findFirstOrThrow({ where: { name: 'e2e flaky' } })).attempts === i + 1);
      await sleep(50);
    }
  } finally {
    stop2();
  }
  const gaveUp = await prisma.job.findFirstOrThrow({ where: { name: 'e2e flaky' } });
  assert.ok(gaveUp.failedAt, 'given up after 5 tries');
  failuresLeft = 0;
  await prisma.job.deleteMany({ where: { name: 'e2e flaky' } });
});

test('three servers working the same queue run each job exactly once', async () => {
  seen.length = 0;
  for (let i = 0; i < 60; i++) record.soon({ value: `job ${i}` }, undefined, 0);
  await until('all queued', async () => (await prisma.job.count({ where: { name: 'e2e record' } })) === 60);
  const stops = [startJobWorker(10), startJobWorker(10), startJobWorker(10)];
  try {
    await until('all ran', () => seen.length >= 60);
    await sleep(200);
  } finally {
    stops.forEach(stop => stop());
  }
  assert.equal(seen.length, 60);
  assert.equal(new Set(seen).size, 60);
});

test('a job whose server died mid-run is taken over once its lock runs out', async () => {
  seen.length = 0;
  await prisma.job.create({
    data: { id: 'e2e-orphan', name: 'e2e record', args: { value: 'orphan' }, runAt: new Date(), attempts: 1, lockedUntil: new Date(Date.now() + 60_000) },
  });
  const stop = startJobWorker(20);
  try {
    await sleep(200);
    assert.equal(seen.length, 0, 'still locked by the server that took it');
    await prisma.job.update({ where: { id: 'e2e-orphan' }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await until('taken over', () => seen.includes('orphan'));
  } finally {
    stop();
  }
});

// ── Daily jobs ──

test('three servers fire at once: the job runs once', async () => {
  let runs = 0;
  const job = async () => {
    runs++;
    await sleep(50);
  };
  const at = new Date('2026-11-10T03:00:00Z');
  const ran = await Promise.all([runDaily(NAME, at, job), runDaily(NAME, at, job), runDaily(NAME, at, job)]);
  assert.equal(runs, 1);
  assert.deepEqual(ran.filter(Boolean).length, 1);
});

test('a server whose timer fires after the job already finished still skips it', async () => {
  let runs = 0;
  const at = new Date('2026-11-11T03:00:00Z');
  await runDaily(NAME, at, async () => runs++);
  await runDaily(NAME, at, async () => runs++);
  assert.equal(runs, 1);
});

test('the next day runs again; the day is Jordan’s, not UTC’s', async () => {
  let runs = 0;
  // 22:30 UTC on the 11th is 01:30 on the 12th in Jordan: a new day.
  assert.equal(await runDaily(NAME, new Date('2026-11-11T22:30:00Z'), async () => runs++), true);
  // 20:00 UTC on the 11th is 23:00 on the 11th in Jordan: the day the test above already ran.
  assert.equal(await runDaily(NAME, new Date('2026-11-11T20:00:00Z'), async () => runs++), false);
  assert.equal(runs, 1);
});

test('catching up: the last time the hour came, so a server starting late runs the day it missed', () => {
  // 06:00 in Jordan is 03:00 UTC.
  assert.equal(lastTime(6, new Date('2026-11-10T05:00:00Z')).toISOString(), '2026-11-10T03:00:00.000Z');
  assert.equal(lastTime(6, new Date('2026-11-10T02:59:00Z')).toISOString(), '2026-11-09T03:00:00.000Z');
  assert.equal(lastTime(6, new Date('2026-11-10T03:00:00Z')).toISOString(), '2026-11-10T03:00:00.000Z');
  // 02:00 in Jordan is 23:00 UTC the day before.
  assert.equal(lastTime(2, new Date('2026-11-10T01:00:00Z')).toISOString(), '2026-11-09T23:00:00.000Z');
});
