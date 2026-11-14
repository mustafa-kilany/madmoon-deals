// Stage 2 of docs/LOAD_BALANCER_TEST_PLAN.md: the same kind of virtual phones as balancer-test.ts, against a
// hosted TEST COPY through the host's own balancer. Never against the copy real people use.
//
//   $env:BALANCER_URL="https://<test copy>"; npm run balancer-test:hosted
//
// The test copy must run in development mode with DEV_EMAIL_CODE (the plan's settings list) and be seeded
// (npm run db:seed in the image): the script signs its bidders up with the demo code and bids on a seeded
// auction (LISTING, default auction-vehicles). It can't reach each server on its own, so bids go through the
// balancer too, and every phone comes from this PC's one address: the per-address limits (1 000 open, 600 new
// a minute, per server) set the ceiling, and phones connect at 8 a second to stay under the second one.
// Chat signals use the same database channel as bids (Stage 1 check 2): two real phones cover them (T4).
//
// Settings: CODE (default 123456), LISTING, STEPS (default 200,500,900 phones), QUIET_SECONDS (default 180).

import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const BASE = (process.env.BALANCER_URL ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(BASE)) {
  console.error('Set BALANCER_URL to the test copy, e.g. $env:BALANCER_URL="https://madmoon-test.up.railway.app"');
  process.exit(1);
}
const WS_BASE = BASE.replace(/^http/, 'ws');
const CODE = process.env.CODE ?? '123456';
const LISTING = process.env.LISTING ?? 'auction-vehicles';
const STEPS = (process.env.STEPS ?? '200,500,900').split(',').map(Number);
const QUIET_SECONDS = Number(process.env.QUIET_SECONDS ?? 180);
const CONNECTS_PER_SECOND = 8; // the server allows 600 new connections a minute per address
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Talking to the test copy ──

type Reply = { status: number; body: any; ms: number };
const call = async (method: string, url: string, options: { token?: string; body?: unknown } = {}): Promise<Reply> => {
  const started = performance.now();
  try {
    const response = await fetch(BASE + url, {
      method,
      headers: {
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: response.status, body, ms: performance.now() - started };
  } catch (error) {
    return { status: 0, body: String(error), ms: performance.now() - started };
  }
};

// ── Virtual phones ──

class Phone {
  ws?: WebSocket;
  state: 'new' | 'open' | 'refused' | 'closed' = 'new';
  refusedWith = 0;
  heard = new Map<number, number>();
  order: number[] = [];
  closes = 0;

  open() {
    return new Promise<void>(resolve => {
      const ws = new WebSocket(`${WS_BASE}/v1/listings/${LISTING}/live`, { perMessageDeflate: false, handshakeTimeout: 15_000 });
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
      ws.on('message', data => {
        const message = JSON.parse(String(data)) as { type: string; bid?: { amountFils: number } };
        if (message.type === 'bid' && message.bid && !this.heard.has(message.bid.amountFils)) {
          this.heard.set(message.bid.amountFils, performance.now());
          this.order.push(message.bid.amountFils);
        }
      });
      ws.on('close', () => {
        if (this.state === 'open') {
          this.state = 'closed';
          this.closes++;
        }
        done();
      });
    });
  }

  stop() {
    this.ws?.terminate();
  }
}

/** Opens them at CONNECTS_PER_SECOND, without waiting for each before starting the next. */
const connectAll = async (phones: Phone[]) => {
  const opening: Promise<void>[] = [];
  for (const phone of phones) {
    opening.push(phone.open());
    await sleep(1000 / CONNECTS_PER_SECOND);
  }
  await Promise.all(opening);
};

// ── Bids ──

type Sent = { amount: number; at: number };
let bidders: { token: string }[] = [];
let turn = 0;
let price = 0;
let step = 0;
const bid = async (): Promise<Sent> => {
  const amount = price + step;
  const at = performance.now();
  const reply = await call('POST', `/v1/listings/${LISTING}/bids`, { token: bidders[turn++ % bidders.length].token, body: { amountFils: amount } });
  if (reply.status !== 201) throw new Error(`A bid answered ${reply.status}: ${JSON.stringify(reply.body).slice(0, 200)}`);
  price = amount;
  return { amount, at };
};

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};
const ms = (value: number) => `${Math.round(value)} ms`;

const delivery = async (phones: Phone[], sent: Sent[], waitMs = 5000) => {
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
const everyone: Phone[] = [];
try {
  const health = await call('GET', '/v1/health');
  if (health.status !== 200) throw new Error(`${BASE}/v1/health answered ${health.status}: is the test copy up?`);
  console.log(`Test copy ${BASE}: health ${ms(health.ms)} from here`);

  const listing = await call('GET', `/v1/listings/${LISTING}`);
  if (listing.status !== 200 || listing.body.saleType !== 'auction') throw new Error(`${LISTING} isn't an auction on the test copy (${listing.status}): was it seeded? (npm run db:seed in the image)`);
  if (new Date(listing.body.auction.endsAt).getTime() - Date.now() < 3_600_000) throw new Error(`${LISTING} ends within the hour: seed again, or set LISTING to another auction`);
  price = listing.body.priceFils;
  step = listing.body.auction.incrementFils;

  // Bidders: signed up with the demo code. 20 of them keep each under the 60-bids-an-hour limit.
  const run = Date.now().toString(36);
  bidders = [];
  for (let i = 0; i < 20; i++) {
    const reply = await call('POST', '/v1/auth/signup', {
      body: { name: `Load Bidder ${i}`, email: `bt-${run}-${i}@example.com`, password: 'balancer-test-password', acceptTerms: true, code: CODE },
    });
    if (reply.status !== 201) throw new Error(`Sign-up answered ${reply.status}: ${JSON.stringify(reply.body).slice(0, 200)} (does the test copy have DEV_EMAIL_CODE=${CODE}?)`);
    bidders.push({ token: reply.body.token });
  }

  // ── Check 1: bids reach every phone through the host's balancer ──
  const room = Array.from({ length: STEPS[0] }, () => new Phone());
  everyone.push(...room);
  await connectAll(room);
  const sent1: Sent[] = [];
  for (let i = 0; i < 50; i++) sent1.push(await bid());
  const one = await delivery(room, sent1);
  record(
    `1 bids reach ${STEPS[0]} phones`,
    one.phones === STEPS[0] && one.missed === 0 && one.outOfOrder === 0 && one.worst < 1000,
    `${one.phones}/${STEPS[0]} connected (refused: ${[...new Set(room.filter(p => p.state !== 'open').map(p => p.refusedWith))].join(', ') || 'none'}), 50 bids: missed ${one.missed}, out of order ${one.outOfOrder}, average ${ms(one.average)}, p95 ${ms(one.p95)}, worst ${ms(one.worst)} (from sending to hearing, the internet both ways included)`,
  );

  // ── Check 3: connections survive the host's idle timeout ──
  console.log(`Check 3: ${QUIET_SECONDS} s of quiet…`);
  const closesBefore = room.reduce((sum, phone) => sum + phone.closes, 0);
  await sleep(QUIET_SECONDS * 1000);
  const dropped = room.reduce((sum, phone) => sum + phone.closes, 0) - closesBefore;
  record(`3 quiet for ${QUIET_SECONDS} s`, dropped === 0, `${room.length} phones idle behind the host's balancer: ${dropped} dropped`);

  // ── Check 7: growing numbers ──
  for (const target of STEPS) {
    const adding = Array.from({ length: Math.max(0, target - everyone.length) }, () => new Phone());
    everyone.push(...adding);
    await connectAll(adding);
    await sleep(1000);
    const sent: Sent[] = [];
    for (let i = 0; i < 10; i++) {
      sent.push(await bid());
      await sleep(100);
    }
    const result = await delivery(everyone, sent);
    const open = everyone.filter(p => p.state === 'open').length;
    record(
      `7 ${target} phones`,
      open === target && result.missed === 0 && result.outOfOrder === 0 && result.worst < 1000,
      `${open}/${target} connected, 10 bids: missed ${result.missed}, average ${ms(result.average)}, p95 ${ms(result.p95)}, worst ${ms(result.worst)}`,
    );
  }

  // ── Requests while connected: what the app does on an auction screen ──
  const polls: number[] = [];
  let pollErrors = 0;
  const until = Date.now() + 30_000;
  await Promise.all(
    Array.from({ length: 50 }, async () => {
      while (Date.now() < until) {
        const reply = await call('GET', `/v1/listings/${LISTING}/bids`);
        polls.push(reply.ms);
        if (reply.status !== 200) pollErrors++;
        await sleep(1000);
      }
    }),
  );
  record(
    'requests alongside',
    pollErrors === 0,
    `50 askers for 30 s with ${everyone.filter(p => p.state === 'open').length} phones connected: ${polls.length} requests, ${pollErrors} errors, p50 ${ms(percentile(polls, 0.5))}, p95 ${ms(percentile(polls, 0.95))}`,
  );
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  everyone.forEach(phone => phone.stop());
}

if (results.some(r => !r.pass)) failed = true;
const file = path.join(os.tmpdir(), `madmoon-balancer-hosted-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), target: BASE, listing: LISTING, results }, null, 2));
console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed. Results: ${file}`);
console.log(failed ? 'FAILED.' : 'Passed.');
process.exit(failed ? 1 : 0);
