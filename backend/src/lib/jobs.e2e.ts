// Daily jobs on several servers (LOAD_BALANCER_TEST_PLAN L2): every server's timer fires at the
// same moment, and only one of them may run the money check, the retention clean-up or the risk check.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prisma } from '../db';
import { runDaily } from './jobs';

const NAME = 'e2e daily job';
const clear = () => prisma.jobRun.deleteMany({ where: { name: NAME } });
before(clear);
after(async () => {
  await clear();
  await prisma.$disconnect();
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
