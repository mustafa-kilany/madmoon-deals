// SECURITY_PLAN S0.10: what really reaches the error service, on a local stand-in for Sentry.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';

const received: { url?: string; auth?: string; body: string }[] = [];
const sentry = createServer((req, res) => {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    received.push({ url: req.url, auth: req.headers['x-sentry-auth'] as string, body });
    res.writeHead(200).end('{}');
  });
});
await new Promise<void>(resolve => sentry.listen(0, '127.0.0.1', resolve));
process.env.SENTRY_DSN = `http://publickey@127.0.0.1:${(sentry.address() as AddressInfo).port}/42`;

const { reportError } = await import('./errorReporter');
const { app } = await import('../app');
const { prisma } = await import('../db');
const { errorHandler } = await import('./errors');

after(async () => {
  sentry.close();
  await prisma.$disconnect();
});

test('an error reaches the service scrubbed, in the envelope format, once a minute at most', async () => {
  const secret = new Error('Failed for sara@example.com with card 4242424242424242 and Bearer abc.def.ghi');
  await reportError(secret, 'POST /orders/:id/pay');
  await reportError(secret, 'POST /orders/:id/pay'); // the same one again
  assert.equal(received.length, 1, 'repeats are held back');
  const [one] = received;
  assert.equal(one.url, '/api/42/envelope/');
  assert.match(one.auth ?? '', /sentry_key=publickey/);
  const [header, kind, event] = one.body.split('\n').map(line => JSON.parse(line));
  assert.ok(header.event_id);
  assert.equal(kind.type, 'event');
  assert.equal(event.transaction, 'POST /orders/:id/pay');
  assert.equal(event.exception.values[0].type, 'Error');
  for (const leak of ['sara@', '4242424242424242', 'abc.def.ghi']) assert.ok(!one.body.includes(leak), leak);
  assert.equal(event.user, undefined);
  assert.equal(event.request, undefined);
});

test('a real server error: the client gets nothing; the report has the route’s pattern, not its ids', async () => {
  received.length = 0;
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  // A route that throws, handled by the real error handler.
  const fail = (await import('express')).default();
  fail.get('/orders/:id', () => {
    throw Object.assign(new Error('Invalid prisma.order.update(): deliveryPhone: "0791234567"'), { name: 'PrismaClientValidationError' });
  });
  fail.use(errorHandler);
  const failing = fail.listen(0);
  await new Promise(resolve => failing.once('listening', resolve));
  const r = await fetch(`http://127.0.0.1:${(failing.address() as AddressInfo).port}/orders/SA-999999?token=abc`);
  assert.equal(r.status, 500);
  assert.deepEqual(await r.json(), { error: { code: 'INTERNAL', message: 'Something went wrong' } });
  for (let i = 0; i < 20 && !received.length; i++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(received.length, 1);
  const body = received[0].body;
  assert.ok(body.includes('GET /orders/:id'));
  for (const leak of ['SA-999999', 'token=abc', '0791234567']) assert.ok(!body.includes(leak), leak);
  server.close();
  failing.close();
});
