// The live auction connection (GET /v1/listings/:id/live): real server, real database, real sockets.

import assert from 'node:assert/strict';
import net from 'node:net';
import { after, afterEach, before, test as nodeTest } from 'node:test';
import { WebSocket } from 'ws';
import { app } from '../../app';
import { prisma } from '../../db';
import { cleanUp, newListing, newPerson, startApi, type Person } from '../../lib/testkit';
import { attachLive } from './live';

const api = startApi();
const EMAILS = ['live.seller@example.com', 'live.a@example.com', 'live.b@example.com'];
const AUCTION = 'live-auction';
const OTHER = 'live-other';
const FIXED = 'live-fixed';
const GONE = 'live-withdrawn';
const LISTINGS = [AUCTION, OTHER, FIXED, GONE];
const auction = { saleType: 'auction' as const, auctionEndsAt: new Date(Date.now() + 3_600_000), incrementFils: 100, priceFils: 1000 };

let seller: Person;
let a: Person;
let b: Person;
let live: ReturnType<typeof attachLive>;
let nextBid = 2000;

const wsUrl = (path: string) => `${api.url().replace(/^http/, 'ws')}${path}`;
const liveUrl = (id: string) => wsUrl(`/listings/${id}/live`);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// A failed or stuck test must still clean up, or its open sockets keep this file from ever finishing.
const test = (name: string, run: () => Promise<void>) => nodeTest(name, { timeout: 20_000 }, run);
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanUpOne of cleanups.splice(0)) cleanUpOne();
});
const tracked = (ws: WebSocket) => {
  cleanups.push(() => ws.terminate());
  return ws;
};
const tempApi = () => {
  const temp = startApi();
  cleanups.push(() => {
    temp.close();
    temp.server.closeAllConnections();
  });
  return temp;
};
const tempLive = (server: typeof api.server, options: Parameters<typeof attachLive>[2] = {}) => {
  const temp = attachLive(server, app, options);
  cleanups.push(() => temp.close());
  return temp;
};

const until = async (what: string, ok: () => boolean, ms = 5000) => {
  const started = Date.now();
  while (!ok()) {
    if (Date.now() - started > ms) assert.fail(`Waited ${ms} ms for: ${what}`);
    await sleep(10);
  }
};

/** A socket plus everything it receives (the "still alive" notes left out). */
const open = async (url: string, headers: Record<string, string> = {}) => {
  const ws = tracked(new WebSocket(url, { headers }));
  const bids: { type: string; bid: Record<string, unknown> }[] = [];
  ws.on('message', data => {
    const message = JSON.parse(String(data));
    if (message.type !== 'alive') bids.push(message);
  });
  const closed = new Promise<number>(resolve => ws.once('close', code => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return { ws, bids, closed };
};

/** The status a refused connection gets. */
const refusedWith = (url: string, headers: Record<string, string> = {}) =>
  new Promise<number>((resolve, reject) => {
    const ws = tracked(new WebSocket(url, { headers }));
    ws.once('open', () => {
      ws.terminate();
      reject(new Error(`${url} was let in`));
    });
    ws.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode ?? 0);
      ws.terminate();
    });
    ws.on('error', () => {});
  });

const bid = (who: Person, id = AUCTION, amountFils = (nextBid += 500)) => api.call('POST', `/listings/${id}/bids`, who, { amountFils });

before(async () => {
  await api.ready;
  await cleanUp(LISTINGS, EMAILS);
  [seller, a, b] = await Promise.all(EMAILS.map(email => newPerson(api, email)));
  await newListing(seller.id, AUCTION, auction);
  await newListing(seller.id, OTHER, auction);
  await newListing(seller.id, FIXED);
  await newListing(seller.id, GONE, { ...auction, status: 'withdrawn' });
  live = attachLive(api.server, app);
  await until('the listener to start', () => live.stats().listening);
});
after(async () => {
  live.close();
  api.close();
  await cleanUp(LISTINGS, EMAILS);
  await prisma.$disconnect();
});

test('a bid reaches everyone watching that auction, well within a second, and nobody else', async () => {
  const [one, two, elsewhere] = await Promise.all([open(liveUrl(AUCTION)), open(liveUrl(AUCTION)), open(liveUrl(OTHER))]);
  const started = performance.now();
  const placed = await bid(a);
  assert.equal(placed.status, 201);
  await until('both watchers', () => one.bids.length === 1 && two.bids.length === 1, 1000);
  assert.ok(performance.now() - started < 1000);
  assert.equal(one.bids[0].bid.amountFils, nextBid);
  await sleep(100);
  assert.equal(elsewhere.bids.length, 0, 'another auction’s watcher got it');
  for (const s of [one, two, elsewhere]) s.ws.close();
});

test('it says exactly what the public bid list says, nothing more', async () => {
  const watcher = await open(liveUrl(AUCTION));
  await bid(b);
  await until('the bid', () => watcher.bids.length === 1);
  const list = await api.call('GET', `/listings/${AUCTION}/bids`);
  assert.deepEqual(watcher.bids[0], { type: 'bid', bid: list.body[0] });
  assert.ok(!JSON.stringify(watcher.bids[0]).includes(b.email));
  watcher.ws.close();
});

test('a refused bid is never announced', async () => {
  const watcher = await open(liveUrl(AUCTION));
  const refused = await bid(a, AUCTION, 1); // far below the price
  assert.equal(refused.status, 422);
  const own = await bid(seller); // a seller can't bid on their own auction
  assert.equal(own.status, 403);
  await bid(b); // to know the refused ones had time to arrive
  await until('the good bid', () => watcher.bids.length > 0);
  await sleep(100);
  assert.equal(watcher.bids.length, 1);
  assert.equal(watcher.bids[0].bid.amountFils, nextBid);
  watcher.ws.close();
});

test('bids at once all arrive, in the order the price went', async () => {
  const watcher = await open(liveUrl(AUCTION));
  const start = nextBid + 1000;
  const answers = await Promise.all(Array.from({ length: 20 }, (_, i) => bid(i % 2 ? a : b, AUCTION, start + i * 500)));
  const accepted = answers.filter(r => r.status === 201).length;
  assert.ok(accepted > 0);
  nextBid = start + 20 * 500;
  await until('every accepted bid', () => watcher.bids.length === accepted);
  const amounts = watcher.bids.map(m => m.bid.amountFils as number);
  assert.deepEqual(amounts, [...amounts].sort((x, y) => x - y));
  watcher.ws.close();
});

test('only a real auction can be watched, by the app or a page of its own origin', async () => {
  assert.equal(await refusedWith(liveUrl('nope')), 404);
  assert.equal(await refusedWith(liveUrl(FIXED)), 404);
  assert.equal(await refusedWith(liveUrl(GONE)), 404);
  assert.equal(await refusedWith(wsUrl(`/listings/${AUCTION}/live/more`)), 404);
  assert.equal(await refusedWith(wsUrl(`/listings/${AUCTION}/bids`)), 404);
  assert.equal(await refusedWith(wsUrl(`/listings/${"'%20OR%201=1"}/live`)), 404);
  assert.equal(await refusedWith(liveUrl(AUCTION), { Origin: 'https://evil.example.com' }), 403);
  assert.equal(await refusedWith(liveUrl(AUCTION), { Origin: 'not a url' }), 403);

  // What the Android app sends (WebSocketModule.getDefaultOrigin): the API's own address.
  const own = new URL(api.url());
  const app = await open(liveUrl(AUCTION), { Origin: `http://${own.host}` });
  app.ws.close();
});

test('other upgrades are refused and the API keeps working', async () => {
  const answer = await new Promise<string>((resolve, reject) => {
    const { port } = api.server.address() as net.AddressInfo;
    const socket = net.connect(port, '127.0.0.1', () => socket.write('GET /v1/health HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: h2c\r\n\r\n'));
    let text = '';
    socket.on('data', d => (text += d));
    socket.on('close', () => resolve(text));
    socket.on('error', reject);
  });
  assert.match(answer, /^HTTP\/1\.1 404/);
  assert.equal((await api.call('GET', '/health')).status, 200);
});

test('a broken handshake is refused and its slot comes back', async () => {
  const before = live.stats().total;
  const answer = await new Promise<string>((resolve, reject) => {
    const { port } = api.server.address() as net.AddressInfo;
    const socket = net.connect(port, '127.0.0.1', () =>
      socket.write(`GET /v1/listings/${AUCTION}/live HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: short\r\n\r\n`),
    );
    let text = '';
    socket.on('data', d => (text += d));
    socket.on('close', () => resolve(text));
    socket.on('error', reject);
  });
  assert.match(answer, /^HTTP\/1\.1 400/);
  await until('the slot', () => live.stats().total === before);
});

test('nobody can send anything on it', async () => {
  const talker = await open(liveUrl(AUCTION));
  talker.ws.send('hello');
  assert.equal(await talker.closed, 1008);

  const big = await open(liveUrl(AUCTION));
  big.ws.send('x'.repeat(1000));
  assert.equal(await big.closed, 1009);

  const bystander = await open(liveUrl(AUCTION));
  await bid(a);
  await until('the bid', () => bystander.bids.length === 1);
  bystander.ws.close();
});

test('limits: per address, in total, and connections per minute', async () => {
  const tight = tempApi();
  await tight.ready;
  const url = `${tight.url().replace(/^http/, 'ws')}/listings/${AUCTION}/live`;

  const perAddress = tempLive(tight.server, { maxPerAddress: 2 });
  await until('listening', () => perAddress.stats().listening);
  const held = await Promise.all([open(url), open(url)]);
  assert.equal(await refusedWith(url), 503);
  held[0].ws.close();
  await held[0].closed;
  await until('the slot', () => perAddress.stats().total === 1);
  const again = await open(url); // leaving gives the place back
  assert.equal(perAddress.stats().sockets, 2);
  again.ws.close();
  held[1].ws.close();
  perAddress.close();
  await until('all gone', () => perAddress.stats().total === 0);

  const total = tempLive(tight.server, { maxTotal: 1 });
  await until('listening', () => total.stats().listening);
  const only = await open(url);
  assert.equal(await refusedWith(url), 503);
  only.ws.close();
  total.close();

  const perMinute = tempLive(tight.server, { connectsPerMinute: 2 });
  await until('listening', () => perMinute.stats().listening);
  for (let i = 0; i < 2; i++) (await open(url)).ws.close();
  assert.equal(await refusedWith(url), 429);
  perMinute.close();
  tight.close();
});

test('behind a proxy the limits count the person’s address, not the proxy’s', async () => {
  const tight = tempApi();
  await tight.ready;
  const url = `${tight.url().replace(/^http/, 'ws')}/listings/${AUCTION}/live`;
  const limited = tempLive(tight.server, { maxPerAddress: 1 });
  await until('listening', () => limited.stats().listening);
  app.set('trust proxy', 1);
  try {
    const one = await open(url, { 'X-Forwarded-For': '203.0.113.5' });
    const two = await open(url, { 'X-Forwarded-For': '203.0.113.6' });
    assert.equal(await refusedWith(url, { 'X-Forwarded-For': '203.0.113.5' }), 503);
    one.ws.close();
    two.ws.close();
  } finally {
    app.set('trust proxy', false);
    limited.close();
    tight.close();
  }
});

test('a phone that went silent is dropped; a healthy one stays', async () => {
  const quick = tempApi();
  await quick.ready;
  const url = `${quick.url().replace(/^http/, 'ws')}/listings/${AUCTION}/live`;
  const server = tempLive(quick.server, { heartbeatMs: 100 });
  await until('listening', () => server.stats().listening);

  const healthy = await open(url);
  const silent = tracked(new WebSocket(url, { autoPong: false }));
  const silentClosed = new Promise<number>(resolve => silent.once('close', code => resolve(code)));
  await new Promise(resolve => silent.once('open', resolve));

  assert.equal(await silentClosed, 1006);
  assert.equal(healthy.ws.readyState, WebSocket.OPEN);
  healthy.ws.close();
  server.close();
  quick.close();
});

test('hears "alive" so a phone can tell the connection is real', async () => {
  const quick = tempApi();
  await quick.ready;
  const server = tempLive(quick.server, { heartbeatMs: 50 });
  await until('listening', () => server.stats().listening);
  const ws = tracked(new WebSocket(`${quick.url().replace(/^http/, 'ws')}/listings/${AUCTION}/live`));
  const first = await new Promise<string>(resolve => ws.once('message', data => resolve(String(data))));
  assert.deepEqual(JSON.parse(first), { type: 'alive' });
  ws.close();
  server.close();
  quick.close();
});

test('database connection killed: phones are told to reconnect, and bids flow again', async () => {
  const quick = tempApi();
  await quick.ready;
  const url = `${quick.url().replace(/^http/, 'ws')}/listings/${AUCTION}/live`;
  const server = tempLive(quick.server);
  await until('listening', () => server.stats().listening);
  const before = await open(url);

  const pid = (server.listenerForTests() as unknown as { processID: number }).processID;
  await prisma.$executeRaw`SELECT pg_terminate_backend(${pid}::int)`;
  assert.equal(await before.closed, 1013);
  assert.equal(await refusedWith(url), 503); // until it hears again, polling is the honest answer

  await until('listening again', () => server.stats().listening, 10_000);
  const after = await open(url);
  await bid(a);
  await until('the bid after reconnecting', () => after.bids.length === 1);
  after.ws.close();
  server.close();
  quick.close();
});

test('a connection that silently stops delivering (a pooler, a dead link) is noticed', async () => {
  const quick = tempApi();
  await quick.ready;
  const url = `${quick.url().replace(/^http/, 'ws')}/listings/${AUCTION}/live`;
  const server = tempLive(quick.server, { heartbeatMs: 100 });
  await until('listening', () => server.stats().listening);
  const watcher = await open(url);

  await server.listenerForTests()!.query('UNLISTEN *'); // still connected, but hears nothing
  assert.equal(await watcher.closed, 1013);

  await until('listening again', () => server.stats().listening, 10_000);
  const after = await open(url);
  await bid(b);
  await until('the bid after recovering', () => after.bids.length === 1);
  after.ws.close();
  server.close();
  quick.close();
});

test('closing: every phone is told, and the server can finish closing', async () => {
  const quick = tempApi();
  await quick.ready;
  const url = `${quick.url().replace(/^http/, 'ws')}/listings/${AUCTION}/live`;
  const server = tempLive(quick.server);
  await until('listening', () => server.stats().listening);
  const watcher = await open(url);
  const closing = new Promise<void>(resolve => quick.server.close(() => resolve()));
  server.close();
  assert.equal(await watcher.closed, 1001);
  await closing;
});

test('a bid still saves when nobody is listening', async () => {
  assert.equal((await bid(a, OTHER, 5000)).status, 201);
});
