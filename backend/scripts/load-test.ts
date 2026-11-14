// npm run load-test (BACKEND_PLAN B12.5, gate G7): how the server behaves under many people, with
// no outside tool. Starts its own server (development settings, its own database and port),
// fills 2 000 listings, then runs what real phones do most, side by side, and reports each
// request kind's speed and any failure. Fails when anything errors or is too slow.

import 'dotenv/config';
import { execFileSync, spawn } from 'node:child_process';

const PORT = 4102;
const base = `http://127.0.0.1:${PORT}/v1`;
const db = new URL(process.env.DATABASE_URL ?? '');
db.pathname = '/madmoon_load_test';
Object.assign(process.env, {
  NODE_ENV: 'test', // quiet logs, no background jobs in the way
  DATABASE_URL: db.toString(),
  PORT: String(PORT),
  RATE_LIMIT_MULTIPLIER: '1000', // the limits have their own tests; this measures speed
  DEV_EMAIL_CODE: '123456',
  PAYMENT_MODE: 'fake',
  PUSH_MODE: 'off',
  MAIL_MODE: 'console',
  GEOCODER: 'off',
  LOG_LEVEL: 'silent',
});
const shell = process.platform === 'win32';
execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'ignore', env: process.env, shell });
execFileSync('npx', ['tsx', 'scripts/empty-db.ts'], { stdio: 'ignore', env: process.env, shell });
const server = spawn('npx', ['tsx', 'src/server.ts'], { env: process.env, stdio: 'ignore', shell });
const stop = () => {
  if (process.platform === 'win32' && server.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
  } else server.kill('SIGTERM');
};

const USERS = Number(process.env.LOAD_USERS ?? 60);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 30);
const LIMIT_P95_MS = 800;

type Stat = { times: number[]; errors: number; firstError?: string };
const stats = new Map<string, Stat>();
const hit = async (name: string, path: string, init?: RequestInit) => {
  const stat = stats.get(name) ?? { times: [], errors: 0 };
  stats.set(name, stat);
  const started = performance.now();
  try {
    const r = await fetch(base + path, init);
    const text = await r.text();
    stat.times.push(performance.now() - started);
    // A bid below the current price is a normal refusal when many people bid: 422 isn't a failure there.
    if (r.status >= 500 || (r.status >= 400 && name !== 'auction: bid')) {
      stat.errors++;
      stat.firstError ??= `${r.status} ${text.slice(0, 120)}`;
    }
    return text;
  } catch (error) {
    stat.errors++;
    stat.firstError ??= String(error);
    return '';
  }
};

let failed = false;
try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    up = await fetch(`${base}/health`).then(r => r.ok, () => false);
  }
  if (!up) throw new Error('The server did not start');

  const { prisma } = await import('../src/db');
  const { hashPassword } = await import('../src/modules/auth/password');
  const { issueToken } = await import('../src/modules/auth/tokens');
  const passwordHash = await hashPassword('load-test-password');
  const seller = await prisma.user.create({ data: { name: 'Seller', email: 'load.seller@example.com', passwordHash } });
  const words = ['iphone', 'samsung', 'sofa', 'table', 'laptop', 'oven', 'bicycle', 'watch', 'camera', 'desk'];
  const categories = [['mobiles', 'phones'], ['furniture', 'sofas'], ['electronics', 'laptops'], ['appliances', 'ovens']];
  await prisma.listing.createMany({
    data: Array.from({ length: 2000 }, (_, i) => {
      const [category, type] = categories[i % categories.length];
      const word = words[i % words.length];
      return {
        id: `load-${i}`, category, type, titleAr: `منتج ${i}`, titleEn: `${word} ${i}`, priceFils: 1000 + i * 50, imageUrls: ['https://images.example.com/x.jpg'],
        condition: 'good' as const, locationId: 'amman', description: 'A good item in working order, clean and ready to be collected by the driver today.',
        searchText: `${word} ${i}`, sellerUserId: seller.id,
        ...(i % 10 === 0 && { saleType: 'auction' as const, auctionEndsAt: new Date(Date.now() + 86_400_000), incrementFils: 1000 }),
      };
    }),
  });

  const people = await Promise.all(
    Array.from({ length: USERS }, async (_, i) => {
      const user = await prisma.user.create({ data: { name: `Person ${i}`, email: `load.${i}@example.com`, passwordHash } });
      return { id: user.id, token: await issueToken(user.id) };
    }),
  );
  console.log(`${USERS} people for ${SECONDS} seconds on 2 000 listings…`);

  const until = Date.now() + SECONDS * 1000;
  const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });
  await Promise.all(
    people.map(async (person, n) => {
      let i = n;
      while (Date.now() < until) {
        i++;
        const auctionId = `load-${(i % 200) * 10}`;
        await hit('browse: first page', '/listings?limit=20');
        await hit('browse: category', `/listings?category=${categories[i % 4][0]}&limit=20`);
        await hit('search', `/listings?q=${words[i % 10]}&limit=20`);
        await hit('product page', `/listings/load-${i % 2000}`);
        await hit('auction: poll', `/listings/${auctionId}/bids`);
        await hit('auction: poll', `/listings/${auctionId}`);
        await hit('my profile', '/me', auth(person.token));
        await hit('chats: poll', '/chats', auth(person.token));
        if (i % 5 === 0) {
          await hit('auction: bid', `/listings/${auctionId}/bids`, {
            method: 'POST',
            headers: { ...auth(person.token).headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountFils: 500_000 + i * 1000 + n * 10 + Math.floor(Math.random() * 100_000) }),
          });
        }
      }
    }),
  );

  const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  let total = 0;
  console.log('request            count    p50    p95    max  errors');
  for (const [name, stat] of stats) {
    const sorted = [...stat.times].sort((a, b) => a - b);
    total += sorted.length;
    const p95 = percentile(sorted, 0.95);
    console.log(`${name.padEnd(18)} ${String(sorted.length).padStart(5)} ${percentile(sorted, 0.5).toFixed(0).padStart(6)} ${p95.toFixed(0).padStart(6)} ${(sorted.at(-1) ?? 0).toFixed(0).padStart(6)} ${String(stat.errors).padStart(7)}`);
    if (stat.errors) {
      failed = true;
      console.log(`  first error: ${stat.firstError}`);
    }
    if (p95 > LIMIT_P95_MS) {
      failed = true;
      console.log(`  too slow: p95 above ${LIMIT_P95_MS} ms`);
    }
  }
  console.log(`${total} requests, ${(total / SECONDS).toFixed(0)} a second.`);
  await prisma.$disconnect();
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  stop();
}
console.log(failed ? 'FAILED.' : 'Passed.');
process.exit(failed ? 1 : 0);
