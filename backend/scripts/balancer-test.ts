// npm run balancer-test (docs/LOAD_BALANCER_TEST_PLAN.md, Stage 1): two copies of the backend on this
// PC behind a balancer, sharing the sahla_load_test database, with virtual phones connecting through it
// the way the app does. Runs checks 1 to 9, prints a pass/fail table, stops everything.
//
// The balancer is scripts/balancer.ts (nginx for Windows couldn't be downloaded on this PC). Each
// virtual phone connects from its own local address (127.x.y.z), so the servers see separate people.
// Takes about 8 minutes. Close games and the emulator first: they halve the numbers.

import 'dotenv/config';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

if (process.env.BALANCER_URL) {
  // Stage 2 needs test accounts on the hosted test copy, which can't be made from here yet (NEXT_STEPS C3).
  console.error('BALANCER_URL (Stage 2) is not wired yet: see docs/LOAD_BALANCER_TEST_PLAN.md, Stage 2.');
  process.exit(1);
}

const BALANCER = 4200;
const A = 4201;
const B = 4202;
const LONE = 4203; // check 6: a server that doesn't trust the balancer's X-Forwarded-For
const LONE_BALANCER = 4210;
const local = (port: number) => `http://127.0.0.1:${port}`;

const db = new URL(process.env.DATABASE_URL ?? '');
db.pathname = '/sahla_load_test';
const serverEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test', // no background pushes
  DATABASE_URL: db.toString(),
  TRUST_PROXY: '1',
  RATE_LIMIT_MULTIPLIER: '1', // the real limits
  PAYMENT_MODE: 'fake',
  PUSH_MODE: 'off',
  MAIL_MODE: 'console',
  GEOCODER: 'off',
  LOG_LEVEL: 'warn',
};
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: db.toString(), LOG_LEVEL: 'silent' });

const logDir = path.join(os.tmpdir(), 'sahla-balancer-test');
mkdirSync(logDir, { recursive: true });
const shell = process.platform === 'win32';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Processes ──

const children = new Map<string, ChildProcess>();
const startProcess = (name: string, args: string[], env: NodeJS.ProcessEnv) => {
  const out = openSync(path.join(logDir, `${name}.log`), 'a');
  children.set(name, spawn(process.execPath, ['--import', 'tsx', ...args], { env, stdio: ['ignore', out, out] }));
};
// node directly, not npx: a kill reaches the server itself.
const startServer = (name: string, port: number, extra: NodeJS.ProcessEnv = {}) =>
  startProcess(name, ['src/server.ts'], { ...serverEnv, PORT: String(port), ...extra });
const startBalancer = (name: string, port: number, servers: number[]) =>
  startProcess(name, ['scripts/balancer.ts', String(port), servers.join(',')], process.env);
const kill = (name: string) => {
  const child = children.get(name);
  children.delete(name);
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
  } else child.kill('SIGKILL');
};
const killAll = () => [...children.keys()].forEach(kill);
process.on('SIGINT', () => {
  killAll();
  process.exit(130);
});

const memoryMb = (name: string) => {
  const pid = children.get(name)?.pid;
  if (!pid) return 0;
  try {
    if (process.platform === 'win32') {
      const line = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      return Math.round(Number(line.trim().split('","').at(-1)!.replace(/\D/g, '')) / 1024);
    }
    return Math.round(Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] ?? 0) / 1024);
  } catch {
    return 0;
  }
};

// ── Talking to the servers ──

const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });
type Reply = { status: number; body: unknown; ms: number };
const call = (base: string, method: string, url: string, options: { address?: string; token?: string; forwardedFor?: string; body?: unknown } = {}) =>
  new Promise<Reply>(resolve => {
    const started = performance.now();
    const target = new URL(base + url);
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    const req = http.request(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method,
        agent,
        localAddress: options.address,
        timeout: 15_000,
        headers: {
          ...(payload && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
          ...(options.token && { Authorization: `Bearer ${options.token}` }),
          ...(options.forwardedFor && { 'X-Forwarded-For': options.forwardedFor }),
        },
      },
      res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (text += chunk));
        res.on('end', () => {
          let body: unknown = text;
          try {
            body = JSON.parse(text);
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode ?? 0, body, ms: performance.now() - started });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', error => resolve({ status: 0, body: String(error), ms: performance.now() - started }));
    req.end(payload);
  });

const healthy = async (port: number, seconds = 90) => {
  for (let i = 0; i < seconds * 4; i++) {
    if ((await call(local(port), 'GET', '/v1/health')).status === 200) return;
    await sleep(250);
  }
  throw new Error(`The server on ${port} did not start: see ${logDir}`);
};
const balancerCounts = async (port = BALANCER) =>
  (await call(local(port), 'GET', '/__balancer')).body as { port: number; up: boolean; open: number; upgrades: number }[];

// ── Virtual phones ──

class Phone {
  ws?: WebSocket;
  state: 'new' | 'open' | 'refused' | 'closed' = 'new';
  refusedWith = 0;
  heard = new Map<number, number>(); // bid amount → when it arrived live
  caughtUp = new Set<number>(); // bid amounts fetched after a reconnection
  order: number[] = [];
  chats: { chatId: string; at: number }[] = [];
  closes = 0;
  reconnect = false;
  stopped = false;
  downSince = 0;
  recoveries: number[] = [];

  constructor(
    readonly url: string,
    readonly address?: string,
    readonly headers: Record<string, string> = {},
    readonly listingId?: string,
  ) {}

  open() {
    return new Promise<void>(resolve => {
      const ws = new WebSocket(this.url, { headers: this.headers, localAddress: this.address, perMessageDeflate: false, handshakeTimeout: 15_000 });
      this.ws = ws;
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      ws.on('open', () => {
        this.state = 'open';
        done();
      });
      ws.on('unexpected-response', (_req, res) => {
        this.state = 'refused';
        this.refusedWith = res.statusCode ?? 0;
        res.resume();
        ws.terminate();
        done();
      });
      ws.on('error', () => {
        if (settled) return;
        this.state = 'refused';
        this.refusedWith ||= -1;
        done();
      });
      ws.on('message', data => this.onMessage(String(data)));
      ws.on('close', () => {
        if (this.state === 'open') this.onClose();
        done();
      });
    });
  }

  private onMessage(text: string) {
    const message = JSON.parse(text) as { type: string; bid?: { amountFils: number }; chatId?: string };
    const now = performance.now();
    if (message.type === 'bid' && message.bid && !this.heard.has(message.bid.amountFils)) {
      this.heard.set(message.bid.amountFils, now);
      this.order.push(message.bid.amountFils);
    }
    if (message.type === 'chat' && message.chatId) this.chats.push({ chatId: message.chatId, at: now });
  }

  // What the app does: try again after about a second, growing to 30, then fetch what was missed.
  private onClose() {
    this.state = 'closed';
    this.closes++;
    if (!this.reconnect || this.stopped) return;
    this.downSince = performance.now();
    this.retry(1000);
  }

  private retry(delayMs: number) {
    setTimeout(async () => {
      if (this.stopped) return;
      await this.open();
      if (this.state === 'open') {
        this.recoveries.push(performance.now() - this.downSince);
        await this.catchUp();
      } else this.retry(Math.min(delayMs * 2, 30_000));
    }, delayMs * (0.5 + Math.random()));
  }

  async catchUp() {
    const reply = await call(local(BALANCER), 'GET', `/v1/listings/${this.listingId}/bids`, { address: this.address });
    if (reply.status === 200) for (const bid of reply.body as { amountFils: number }[]) this.caughtUp.add(bid.amountFils);
  }

  has = (amount: number) => this.heard.has(amount) || this.caughtUp.has(amount);

  stop() {
    this.stopped = true;
    this.ws?.terminate();
  }
}

const connectAll = async (phones: Phone[], concurrency = 50) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < phones.length) await phones[next++].open();
    }),
  );
};
const auctionPhone = (listingId: string, address: string) => new Phone(`ws://127.0.0.1:${BALANCER}/v1/listings/${listingId}/live`, address, {}, listingId);
/** `count` phones, `perAddress` from each address of the 127.<block>.x.y range. */
const addresses = (block: number, count: number, perAddress: number) =>
  Array.from({ length: count }, (_, i) => {
    const n = Math.floor(i / perAddress);
    return `127.${block}.${Math.floor(n / 250)}.${(n % 250) + 1}`;
  });
const stopAll = async (phones: Phone[]) => {
  phones.forEach(phone => phone.stop());
  await sleep(1500); // the servers count the closes
};

// ── Bids ──

type Bidder = { id: string; token: string; address: string };
let bidders: Bidder[] = [];
let bidderTurn = 0;
const prices = new Map<string, number>();
type Sent = { amount: number; at: number };
const bid = async (listingId: string, port: number): Promise<Sent> => {
  const amount = (prices.get(listingId) ?? START_FILS) + STEP_FILS;
  const who = bidders[bidderTurn++ % bidders.length];
  const at = performance.now();
  const reply = await call(local(port), 'POST', `/v1/listings/${listingId}/bids`, { token: who.token, forwardedFor: who.address, body: { amountFils: amount } });
  if (reply.status !== 201) throw new Error(`A bid on server ${port} answered ${reply.status}: ${JSON.stringify(reply.body).slice(0, 200)}`);
  prices.set(listingId, amount);
  return { amount, at };
};
const START_FILS = 10_000;
const STEP_FILS = 1_000;

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};
const ms = (value: number) => `${Math.round(value)} ms`;

/** Waits until every open phone heard every bid (or `ms` passes), then measures. */
const delivery = async (phones: Phone[], sent: Sent[], waitMs = 3000) => {
  const listening = phones.filter(phone => phone.state === 'open');
  const started = Date.now();
  while (Date.now() - started < waitMs && !listening.every(phone => sent.every(s => phone.heard.has(s.amount)))) await sleep(20);
  const delays: number[] = [];
  let missed = 0;
  let outOfOrder = 0;
  const wanted = new Set(sent.map(s => s.amount));
  for (const phone of listening) {
    for (const s of sent) {
      const at = phone.heard.get(s.amount);
      if (at === undefined) missed++;
      else delays.push(at - s.at);
    }
    const seen = phone.order.filter(amount => wanted.has(amount));
    if (seen.some((amount, i) => i > 0 && amount <= seen[i - 1])) outOfOrder++;
  }
  return { phones: listening.length, missed, outOfOrder, average: delays.reduce((a, b) => a + b, 0) / (delays.length || 1), p95: percentile(delays, 0.95), worst: Math.max(0, ...delays) };
};

// ── The run ──

type Result = { check: string; pass: boolean; detail: string };
const results: Result[] = [];
const record = (check: string, pass: boolean, detail: string) => {
  results.push({ check, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${check}: ${detail}`);
};

let failed = false;
let prisma: typeof import('../src/db').prisma | undefined;
try {
  console.log(`Database sahla_load_test; server logs in ${logDir}`);
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'ignore', env: process.env, shell });
  execFileSync('npx', ['tsx', 'scripts/empty-db.ts'], { stdio: 'ignore', env: process.env, shell });
  startServer('server-a', A);
  startServer('server-b', B);
  startBalancer('balancer', BALANCER, [A, B]);
  await Promise.all([healthy(A), healthy(B), healthy(BALANCER)]);

  ({ prisma } = await import('../src/db'));
  const { hashPassword } = await import('../src/modules/auth/password');
  const { issueToken } = await import('../src/modules/auth/tokens');
  const passwordHash = await hashPassword('balancer-test-password');
  const person = async (email: string) => {
    const user = await prisma!.user.create({ data: { name: email.split('@')[0], email, passwordHash } });
    return { id: user.id, token: await issueToken(user.id) };
  };
  const owner = await person('bt.owner@example.com');
  const listing = (id: string, sellerUserId: string, auction: boolean) => ({
    id,
    category: 'mobiles',
    type: 'phones',
    titleAr: `منتج ${id}`,
    titleEn: `Phone ${id}`,
    priceFils: START_FILS,
    imageUrls: ['https://images.example.com/x.jpg'],
    condition: 'good' as const,
    locationId: 'amman',
    description: 'A good item in working order, clean and ready to be collected by the driver today.',
    searchText: `phone ${id}`,
    sellerUserId,
    ...(auction && { saleType: 'auction' as const, auctionEndsAt: new Date(Date.now() + 2 * 86_400_000), incrementFils: STEP_FILS }),
  });
  await prisma.listing.createMany({ data: ['bt-1', 'bt-6', 'bt-7', 'bt-9'].map(id => listing(id, owner.id, true)) });
  bidders = await Promise.all(
    Array.from({ length: 60 }, async (_, i) => ({ ...(await person(`bt.bidder.${i}@example.com`)), address: `10.9.0.${i + 1}` })),
  );

  // ── Check 1: a bid reaches phones on the other server ──
  const room = addresses(1, 200, 20).map(address => auctionPhone('bt-1', address));
  await connectAll(room);
  const split = await balancerCounts();
  const sentA: Sent[] = [];
  for (let i = 0; i < 50; i++) sentA.push(await bid('bt-1', A));
  const sentB: Sent[] = [];
  for (let i = 0; i < 50; i++) sentB.push(await bid('bt-1', B));
  const one = await delivery(room, [...sentA, ...sentB]);
  record(
    '1 bids cross servers',
    one.phones === 200 && one.missed === 0 && one.outOfOrder === 0 && one.worst < 1000,
    `${one.phones}/200 phones (A ${split[0].open}, B ${split[1].open}), 100 bids (50 to A, 50 to B): missed ${one.missed}, out of order ${one.outOfOrder}, average ${ms(one.average)}, p95 ${ms(one.p95)}, worst ${ms(one.worst)}`,
  );

  // ── Check 2: chat and unread signals cross servers ──
  const sellers = await Promise.all(Array.from({ length: 100 }, (_, i) => person(`bt.seller.${i}@example.com`)));
  const buyers = await Promise.all(Array.from({ length: 100 }, (_, i) => person(`bt.buyer.${i}@example.com`)));
  await prisma.listing.createMany({ data: sellers.map((seller, i) => listing(`bt-chat-${i}`, seller.id, false)) });
  const chats = await Promise.all(buyers.map((buyer, i) => prisma!.chat.create({ data: { listingId: `bt-chat-${i}`, buyerId: buyer.id } })));
  const receivers = sellers.map(
    (seller, i) => new Phone(`ws://127.0.0.1:${B}/v1/me/live`, undefined, { Authorization: `Bearer ${seller.token}`, 'X-Forwarded-For': `10.2.0.${i + 1}` }),
  );
  await connectAll(receivers, 20);
  const chatSent: number[] = [];
  const chatErrors: number[] = [];
  let pair = 0;
  await Promise.all(
    Array.from({ length: 10 }, async () => {
      while (pair < 100) {
        const i = pair++;
        chatSent[i] = performance.now();
        const reply = await call(local(A), 'POST', `/v1/chats/${chats[i].id}/messages`, { token: buyers[i].token, forwardedFor: `10.2.1.${i + 1}`, body: { text: `hello ${i}` } });
        if (reply.status !== 201) chatErrors.push(reply.status);
      }
    }),
  );
  const chatStarted = Date.now();
  while (Date.now() - chatStarted < 3000 && !receivers.every((phone, i) => phone.chats.some(c => c.chatId === chats[i].id))) await sleep(20);
  const chatDelays = receivers.flatMap((phone, i) => phone.chats.filter(c => c.chatId === chats[i].id).map(c => c.at - chatSent[i]));
  const wrong = receivers.filter((phone, i) => phone.chats.some(c => c.chatId !== chats[i].id)).length;
  record(
    '2 chat signals cross servers',
    receivers.every(p => p.state === 'open') && chatErrors.length === 0 && chatDelays.length === 100 && wrong === 0 && Math.max(...chatDelays) < 1000,
    `100 pairs, sent on A, heard on B: ${chatDelays.length}/100 arrived, ${chatErrors.length} send errors, ${wrong} heard someone else's, average ${ms(chatDelays.reduce((a, b) => a + b, 0) / (chatDelays.length || 1))}, worst ${ms(Math.max(0, ...chatDelays))}`,
  );
  await stopAll(receivers);

  // ── Check 3: connections survive quiet periods ──
  console.log('Check 3: 3 minutes of quiet…');
  const closesBefore = room.reduce((sum, phone) => sum + phone.closes, 0);
  await sleep(180_000);
  const dropped = room.reduce((sum, phone) => sum + phone.closes, 0) - closesBefore;
  record('3 quiet for 3 minutes', dropped === 0, `200 phones behind a 60-second idle cut, 3 minutes: ${dropped} dropped`);

  // ── Check 4: one server dies ──
  room.forEach(phone => (phone.reconnect = true));
  const onB = (await balancerCounts())[1].open;
  const sent4: Sent[] = [];
  for (let i = 0; i < 40; i++) {
    if (i === 5) kill('server-b');
    sent4.push(await bid('bt-1', A));
    await sleep(250);
  }
  const recoverStarted = Date.now();
  while (Date.now() - recoverStarted < 30_000 && !room.every(phone => phone.state === 'open' && sent4.every(s => phone.has(s.amount)))) await sleep(100);
  await sleep(500);
  const stillMissing = room.filter(phone => !sent4.every(s => phone.has(s.amount))).length;
  const reconnected = room.filter(phone => phone.recoveries.length).length;
  const recoveries = room.flatMap(phone => phone.recoveries);
  record(
    '4 one server dies',
    room.every(phone => phone.state === 'open') && stillMissing === 0 && reconnected >= onB,
    `${onB} phones were on B; ${reconnected} reconnected to A, recovery average ${ms(recoveries.reduce((a, b) => a + b, 0) / (recoveries.length || 1))}, worst ${ms(Math.max(0, ...recoveries))}; phones missing a bid at the end: ${stillMissing}`,
  );

  // ── Check 5: the server comes back ──
  startServer('server-b', B);
  await healthy(B);
  await sleep(1500); // the balancer's health check sees it
  const newcomers = addresses(5, 100, 20).map(address => auctionPhone('bt-1', address));
  const before5 = await balancerCounts();
  await connectAll(newcomers);
  const after5 = await balancerCounts();
  const landedOnB = after5[1].upgrades - before5[1].upgrades;
  const sent5: Sent[] = [];
  for (let i = 0; i < 10; i++) {
    sent5.push(await bid('bt-1', A));
    sent5.push(await bid('bt-1', B));
  }
  const five = await delivery([...room, ...newcomers], sent5);
  record(
    '5 the server comes back',
    landedOnB >= 40 && five.phones === 300 && five.missed === 0 && five.outOfOrder === 0,
    `of 100 new phones, ${landedOnB} landed on B; 20 bids to both: ${five.phones}/300 phones, missed ${five.missed}, worst ${ms(five.worst)}`,
  );
  await stopAll([...room, ...newcomers]);

  // ── Check 6: limits see the real person ──
  const crowd = Array.from({ length: 1300 }, () => auctionPhone('bt-6', '127.6.0.1'));
  const others = Array.from({ length: 50 }, (_, i) => auctionPhone('bt-6', `127.6.1.${i + 1}`));
  await connectAll(crowd);
  await connectAll(others);
  const crowdIn = crowd.filter(p => p.state === 'open').length;
  const crowdRefusals = [...new Set(crowd.filter(p => p.state !== 'open').map(p => p.refusedWith))].join(', ') || 'none';
  const othersIn = others.filter(p => p.state === 'open').length;
  await stopAll([...crowd, ...others]);
  startServer('server-lone', LONE, { TRUST_PROXY: '0' });
  startBalancer('balancer-lone', LONE_BALANCER, [LONE]);
  await Promise.all([healthy(LONE), healthy(LONE_BALANCER)]);
  const loneCrowd = Array.from({ length: 700 }, () => new Phone(`ws://127.0.0.1:${LONE_BALANCER}/v1/listings/bt-6/live`, '127.6.2.1', {}, 'bt-6'));
  const loneOthers = Array.from({ length: 50 }, (_, i) => new Phone(`ws://127.0.0.1:${LONE_BALANCER}/v1/listings/bt-6/live`, `127.6.3.${i + 1}`, {}, 'bt-6'));
  await connectAll(loneCrowd);
  await connectAll(loneOthers);
  const loneOthersIn = loneOthers.filter(p => p.state === 'open').length;
  await stopAll([...loneCrowd, ...loneOthers]);
  kill('balancer-lone');
  kill('server-lone');
  record(
    '6 limits see the real person',
    othersIn === 50 && crowdIn <= 1200 && crowdIn < 1300 && loneOthersIn < 50,
    `TRUST_PROXY=1: 1 300 phones from one address, ${crowdIn} let in (refused: ${crowdRefusals}); 50 others ${othersIn}/50 let in. ` +
      `TRUST_PROXY=0: after 700 from one address, ${loneOthersIn}/50 others let in (everyone looks like the balancer). ` +
      `The per-address limits count per server: 2 servers let one address in twice over`,
  );

  // ── Check 7: growing numbers ──
  const crowd7: Phone[] = [];
  const all7 = addresses(7, 4000, 40);
  for (const step of [200, 1000, 2000, 4000]) {
    const adding = all7.slice(crowd7.length, step).map(address => auctionPhone('bt-7', address));
    crowd7.push(...adding);
    await connectAll(adding, 100);
    await sleep(1000);
    const sent7: Sent[] = [];
    for (let i = 0; i < 10; i++) {
      sent7.push(await bid('bt-7', i % 2 ? B : A));
      await sleep(100);
    }
    const result = await delivery(crowd7, sent7, 5000);
    const counts = await balancerCounts();
    const open = crowd7.filter(p => p.state === 'open').length;
    record(
      `7 ${step} phones`,
      open === step && result.missed === 0 && result.outOfOrder === 0 && (step > 2000 || result.worst < 1000),
      `${open}/${step} connected (A ${counts[0].open}, B ${counts[1].open}), 10 bids: missed ${result.missed}, average ${ms(result.average)}, p95 ${ms(result.p95)}, worst ${ms(result.worst)}; memory A ${memoryMb('server-a')} MB, B ${memoryMb('server-b')} MB, balancer ${memoryMb('balancer')} MB`,
    );
  }

  // ── Check 8: past the limit ──
  const extra = addresses(8, 500, 40).map(address => auctionPhone('bt-7', address));
  await connectAll(extra, 100);
  const refused8 = extra.filter(p => p.state === 'refused');
  const refusedHow = [...new Set(refused8.map(p => p.refusedWith))].join(', ') || 'none';
  const sent8: Sent[] = [];
  const polls8: number[] = [];
  let pollErrors8 = 0;
  let firstError8 = '';
  let sawLast = 0;
  const pollUntil = Date.now() + 15_000;
  const polling = Promise.all(
    refused8.map(async phone => {
      await sleep(Math.random() * 3000);
      let last = 0;
      while (Date.now() < pollUntil) {
        const reply = await call(local(BALANCER), 'GET', '/v1/listings/bt-7/bids', { address: phone.address });
        polls8.push(reply.ms);
        if (reply.status !== 200) {
          pollErrors8++;
          firstError8 ||= `${reply.status} ${JSON.stringify(reply.body).slice(0, 120)}`;
        }
        else last = Math.max(0, ...(reply.body as { amountFils: number }[]).map(b => b.amountFils));
        await sleep(3000);
      }
      if (last === prices.get('bt-7')) sawLast++;
    }),
  );
  for (let i = 0; i < 10; i++) {
    sent8.push(await bid('bt-7', i % 2 ? B : A));
    await sleep(500);
  }
  const eight = await delivery(crowd7, sent8, 5000);
  await polling;
  record(
    '8 past the limit',
    refused8.length === 500 && refusedHow === '503' && eight.phones === 4000 && eight.missed === 0 && pollErrors8 === 0 && sawLast === refused8.length,
    `500 more phones: ${refused8.length} refused (${refusedHow}); they asked every 3 s: ${polls8.length} requests, ${pollErrors8} errors${firstError8 ? ` (first: ${firstError8})` : ''}, p95 ${ms(percentile(polls8, 0.95))}, ${sawLast} saw the last bid; the 4 000 connected: missed ${eight.missed}, worst ${ms(eight.worst)}`,
  );
  await stopAll([...crowd7, ...extra]);

  // ── Check 9: live connections down for everyone ──
  kill('server-a');
  kill('server-b');
  const noLive = { LIVE_DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:1/none' };
  startServer('server-a', A, noLive);
  startServer('server-b', B, noLive);
  await Promise.all([healthy(A), healthy(B)]);
  await sleep(1500);
  const viewers = addresses(9, 1000, 40).map(address => auctionPhone('bt-9', address));
  await connectAll(viewers, 100);
  const refused9 = viewers.filter(p => p.state === 'refused').length;
  const polls9: number[] = [];
  let errors9 = 0;
  let firstError9 = '';
  let turn9 = 0;
  const until9 = Date.now() + 60_000;
  const viewing = Promise.all(
    viewers.map(async phone => {
      await sleep(Math.random() * 3000);
      while (Date.now() < until9) {
        for (const url of ['/v1/listings/bt-9', '/v1/listings/bt-9/bids']) {
          const reply = await call(local(BALANCER), 'GET', url, { address: phone.address });
          polls9.push(reply.ms);
          if (reply.status !== 200) {
            errors9++;
            firstError9 ||= `${reply.status} ${JSON.stringify(reply.body).slice(0, 120)}`;
          }
        }
        await sleep(3000);
      }
    }),
  );
  while (Date.now() < until9) {
    await bid('bt-9', turn9++ % 2 ? B : A);
    await sleep(1000);
  }
  await viewing;
  const stillUp = (await call(local(A), 'GET', '/v1/health')).status === 200 && (await call(local(B), 'GET', '/v1/health')).status === 200;
  record(
    '9 live down, 1 000 asking every 3 s',
    refused9 === 1000 && errors9 === 0 && stillUp,
    `${refused9}/1000 refused a live connection; ${polls9.length} requests in 60 s (${Math.round(polls9.length / 60)} a second): ${errors9} errors${firstError9 ? ` (first: ${firstError9})` : ''}, p50 ${ms(percentile(polls9, 0.5))}, p95 ${ms(percentile(polls9, 0.95))}, worst ${ms(Math.max(0, ...polls9))}; servers up: ${stillUp}; memory A ${memoryMb('server-a')} MB, B ${memoryMb('server-b')} MB`,
  );
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.stack : error);
} finally {
  killAll();
  await prisma?.$disconnect();
}

if (results.some(r => !r.pass)) failed = true;
const file = path.join(logDir, `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), cpu: os.cpus()[0]?.model, results }, null, 2));
console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed. Results: ${file}`);
console.log(failed ? 'FAILED.' : 'Passed.');
process.exit(failed ? 1 : 0);
