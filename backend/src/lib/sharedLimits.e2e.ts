// Rate limits on several servers (SECURITY_PLAN S0.9, LOAD_BALANCER_TEST_PLAN L1). Each server
// builds its own limits when it starts; the counts must still be one count, kept in the database,
// or two servers allow 10 card tries an hour instead of 5.

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, test } from 'node:test';
import express, { type RequestHandler } from 'express';

process.env.RATE_LIMIT_MULTIPLIER = '1'; // the real budgets, before the settings are read
process.env.TRUST_PROXY = '1'; // so the tests can come from many addresses

const { perUser } = await import('./rateLimit');
const { prisma } = await import('../db');

const servers: Server[] = [];
after(async () => {
  for (const server of servers) server.close();
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'e2e-' } } });
  await prisma.$disconnect();
});

/** One "server": its own express app and its own copy of the limit, as each process builds at start. */
const server = async (limit: () => RequestHandler[], status = 200) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.locals.user = { id: req.get('x-user') } as never;
    next();
  });
  app.post('/try', ...limit(), (_req, res) => void res.status(status).end());
  const listening = app.listen(0);
  servers.push(listening);
  await new Promise(resolve => listening.once('listening', resolve));
  const url = `http://127.0.0.1:${(listening.address() as AddressInfo).port}/try`;
  return async (user: string, address = '10.1.1.1') =>
    (await fetch(url, { method: 'POST', headers: { 'x-user': user, 'X-Forwarded-For': address } })).status;
};

test('five card tries an hour, split across two servers: the sixth is refused on either', async () => {
  const name = `e2e-card-${randomUUID()}`;
  const card = () => perUser(name, { limit: 5, minutes: 60, ipLimit: 20, message: 'Too many card attempts' });
  const [one, two] = [await server(card), await server(card)];
  const me = randomUUID();
  const statuses = [await one(me), await two(me), await one(me), await two(me), await one(me), await two(me), await one(me)];
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
  assert.equal(await two(randomUUID()), 200, 'someone else was refused too');
});

test('the per-address fence is shared too: one address, many accounts', async () => {
  const name = `e2e-card-ip-${randomUUID()}`;
  const card = () => perUser(name, { limit: 5, minutes: 60, ipLimit: 20, message: 'Too many card attempts' });
  const [one, two] = [await server(card), await server(card)];
  const address = `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const statuses: number[] = [];
  for (let i = 0; i < 21; i++) statuses.push(await (i % 2 ? two : one)(randomUUID(), address));
  assert.equal(statuses.filter(s => s === 200).length, 20);
  assert.equal(statuses.at(-1), 429);
});

test('limits that count only successes: refused tries on another server don’t use the budget', async () => {
  const name = `e2e-listing-${randomUUID()}`;
  const listing = () => perUser(name, { limit: 2, minutes: 60, onlySuccessful: true, message: 'Too many new listings' });
  const fails = await server(listing, 422);
  const works = await server(listing, 201);
  const me = randomUUID();
  assert.deepEqual([await fails(me), await fails(me), await fails(me)], [422, 422, 422]);
  await new Promise(resolve => setTimeout(resolve, 200)); // a refusal is taken back after its answer is sent
  assert.deepEqual([await works(me), await works(me), await works(me)], [201, 201, 429]);
});
