// npm run check:attack (SECURITY_PLAN S9, gate G4): starts this server in PRODUCTION mode on a
// throwaway database and attacks it from outside: headers, forged tokens, injection,
// traversal, floods, and junk sent to EVERY route, with no token, as a customer and as an
// admin. Anything that answers 500, shows a stack or SQL, or lets a forged token in is a
// problem. It starts and stops only its own server, on its own port.

import 'dotenv/config';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PORT = 4101;
const base = `http://127.0.0.1:${PORT}/v1`;
const dev = new URL(process.env.DATABASE_URL ?? '');
const db = new URL(dev);
db.pathname = '/madmoon_attack_test';

const secret = () => randomBytes(32).toString('base64url');
Object.assign(process.env, {
  NODE_ENV: 'production',
  DATABASE_URL: db.toString(),
  PORT: String(PORT),
  JWT_SECRET: secret(),
  ID_HASH_SECRET: secret(),
  PUBLIC_URL: 'https://api.sahla.example',
  ADMIN_ORIGIN: 'https://admin.sahla.example',
  STORAGE: 's3',
  S3_ENDPOINT: 'http://127.0.0.1:9', // nothing there: uploads fail safely
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
  S3_PUBLIC_BUCKET: 'pub',
  S3_PRIVATE_BUCKET: 'priv',
  FILES_PUBLIC_URL: 'https://files.sahla.example',
  MAIL_MODE: 'postmark',
  POSTMARK_SERVER_TOKEN: 'none',
  DEV_EMAIL_CODE: '',
  PAYMENT_MODE: 'off',
  SANAD_MODE: 'off',
  GEOCODER: 'off',
  PUSH_MODE: 'off',
  ADMIN_2FA: 'on',
  RATE_LIMIT_MULTIPLIER: '1',
  GOOGLE_CLIENT_IDS: '',
  APPLE_CLIENT_IDS: '',
  GOOGLE_MAPS_API_KEY: '',
  GOOGLE_VISION_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  LOG_LEVEL: 'silent',
  SENTRY_DSN: '',
  TRUST_PROXY: '1', // the fuzzing below comes from many addresses, so the overall limit doesn't hide it
});

const shell = process.platform === 'win32';
execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: ['ignore', 'ignore', 'inherit'], env: process.env, shell });
execFileSync('npx', ['tsx', 'scripts/empty-db.ts'], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, NODE_ENV: 'test', STORAGE: 'local' }, shell });

const server = spawn('npx', ['tsx', 'src/server.ts'], { env: process.env, stdio: 'ignore', shell });
const stopServer = () => {
  if (process.platform === 'win32' && server.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
  } else server.kill('SIGTERM');
};

const problems: string[] = [];
let checks = 0;
const problem = (text: string) => void problems.push(text);
const expect = (ok: boolean, text: string) => {
  checks++;
  if (!ok) problem(text);
};

/** Server internals that must never reach a client. */
const LEAK = /prisma|postgres|sql|syntax error|stack|node_modules|\.ts:\d+|at [\w.]+ \(|ECONNREFUSED|127\.0\.0\.1/i;

let sentFrom = 0;
const nextAddress = () => {
  sentFrom++;
  return `10.${(sentFrom >> 16) & 255}.${(sentFrom >> 8) & 255}.${sentFrom & 255}`;
};
const call = async (method: string, path: string, { token, body, headers }: { token?: string; body?: string; headers?: Record<string, string> } = {}) => {
  const r = await fetch(path.startsWith('http') ? path : base + path, {
    method,
    redirect: 'manual',
    headers: {
      'X-Forwarded-For': nextAddress(),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body,
  });
  return { status: r.status, headers: r.headers, text: await r.text() };
};
const clean = (label: string, r: { status: number; text: string }) => {
  expect(r.status !== 500, `${label} → 500`);
  expect(!LEAK.test(r.text), `${label} leaks internals: ${r.text.slice(0, 160)}`);
};

try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    up = await fetch(`${base}/health`).then(r => r.ok, () => false);
  }
  if (!up) throw new Error('The production server did not start');
  console.log('Production-mode server is up.');

  // These load after the settings above; the same database and secrets as the server.
  const { prisma } = await import('../src/db');
  const { app } = await import('../src/app');
  const { hashPassword } = await import('../src/modules/auth/password');
  const { issueToken } = await import('../src/modules/auth/tokens');

  const password = 'attacker-long-password-1';
  const hash = await hashPassword(password);
  const customer = await prisma.user.create({ data: { name: 'Customer', email: 'attack.customer@example.com', passwordHash: hash } });
  const victim = await prisma.user.create({ data: { name: 'Victim', email: 'attack.victim@example.com', passwordHash: hash } });
  const courier = await prisma.user.create({ data: { name: 'Courier', email: 'attack.courier@sahla.jo', passwordHash: hash, role: 'courier' } });
  const admin = await prisma.user.create({ data: { name: 'Admin', email: 'attack.admin@sahla.jo', passwordHash: hash, role: 'admin', adminRole: 'owner' } });
  const tokens = {
    customer: await issueToken(customer.id),
    courier: await issueToken(courier.id),
    admin: await issueToken(admin.id, undefined, 'admin'),
  };
  // Many customers: a person's own limits (5 card tries an hour…) would otherwise stop the fuzzing early.
  const crowd: string[] = [];
  for (let i = 0; i < 40; i++) {
    const person = await prisma.user.create({ data: { name: `Crowd ${i}`, email: `attack.crowd${i}@example.com`, passwordHash: hash } });
    crowd.push(await issueToken(person.id));
  }
  await prisma.listing.create({
    data: {
      id: 'attack-listing', category: 'furniture', type: 'sofas', titleAr: 'كنبة', titleEn: 'A sofa', priceFils: 90_000, imageUrls: ['https://images.example.com/x.jpg'],
      condition: 'good', locationId: 'amman', description: 'A corner sofa with washable covers, no tears or stains, easy to take apart.', searchText: 'a sofa', sellerUserId: victim.id,
      pickupPhone: '0799999999', pickupAddress: 'Hidden Street 9',
    },
  });

  // ── Production mode really is production mode ──
  const health = await call('GET', '/health');
  expect(health.status === 200, 'health check');
  const wanted: Record<string, RegExp> = {
    'strict-transport-security': /max-age=\d{7,}/,
    'x-content-type-options': /^nosniff$/,
    'x-frame-options': /./,
    'content-security-policy': /default-src/,
    'referrer-policy': /no-referrer/,
  };
  for (const [name, pattern] of Object.entries(wanted)) expect(pattern.test(health.headers.get(name) ?? ''), `header ${name}: ${health.headers.get(name)}`);
  expect(!health.headers.get('x-powered-by'), 'x-powered-by is sent');
  for (const path of ['/payments/fake/bank/x', '/payments/fake/bank/x/answer']) expect((await call('GET', path)).status === 404, `${path} exists in production`);
  for (const path of ['/static/certificates/x.jpg', '/files/listings/x.jpg', '/.env', '/backend/.env', '/prisma/schema.prisma', '/package.json', '/src/env.ts']) {
    const r = await call('GET', `http://127.0.0.1:${PORT}${path}`);
    expect(r.status === 404, `${path} → ${r.status}`);
  }

  // ── Traversal ──
  for (const path of ['/static/categories/..%2f..%2f..%2f.env', '/static/categories/%2e%2e/%2e%2e/.env', '/static/categories/....//....//.env', '/static/categories/..\\..\\.env']) {
    const r = await call('GET', `http://127.0.0.1:${PORT}${path}`);
    expect(r.status !== 200 && !r.text.includes('DATABASE_URL') && !r.text.includes('JWT_SECRET'), `traversal ${path} → ${r.status}`);
  }

  // ── Forged tokens ──
  const payload = (over: object) => Buffer.from(JSON.stringify({ sub: admin.id, sid: 'x', iss: 'madmoon-api', aud: 'madmoon-admin', exp: 4102444800, ...over })).toString('base64url');
  const header = (alg: string) => Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const { createHmac } = await import('node:crypto');
  const signed = (key: string, body: string) => {
    const head = header('HS256');
    return `${head}.${body}.${createHmac('sha256', key).update(`${head}.${body}`).digest('base64url')}`;
  };
  const session = await prisma.session.findFirstOrThrow({ where: { userId: admin.id } });
  const forged = [
    `${header('none')}.${payload({ sid: session.id })}.`,
    signed('', payload({ sid: session.id })),
    signed('secret', payload({ sid: session.id })),
    signed('sahla', payload({ sid: session.id })),
    tokens.admin.split('.').slice(0, 2).join('.') + '.',
    tokens.customer.replace(/\.[^.]+$/, `.${randomBytes(32).toString('base64url')}`),
  ];
  for (const token of forged) {
    expect((await call('GET', '/admin/me', { token })).status === 401, `a forged token opened the dashboard: ${token.slice(0, 30)}`);
    expect((await call('GET', '/me', { token })).status === 401, 'a forged token opened the app');
  }
  expect((await call('GET', '/admin/me', { token: tokens.customer })).status === 403, 'a customer token on the dashboard');
  expect((await call('GET', '/me', { token: tokens.admin })).status === 401, 'a dashboard token in the app');

  // ── CORS ──
  const evil = await call('GET', '/admin/me', { token: tokens.admin, headers: { Origin: 'https://evil.example' } });
  expect(!evil.headers.get('access-control-allow-origin'), 'CORS allows another origin');
  const preflight = await call('OPTIONS', '/admin/orders', { headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  expect(!preflight.headers.get('access-control-allow-origin'), 'CORS preflight allows another origin');
  const app2 = await call('GET', '/listings', { headers: { Origin: 'https://admin.sahla.example' } });
  expect(!app2.headers.get('access-control-allow-origin'), 'CORS on the app’s endpoints');

  // ── SQL injection, in search and every filter ──
  const INJECTIONS = ["' OR '1'='1", "'; DROP TABLE \"User\"; --", '" OR ""="', "' UNION SELECT \"passwordHash\" FROM \"User\" --", "%' OR 1=1 --", "'; SELECT pg_sleep(4); --", '\\', '%', '_', "O'Brien"];
  const params = ['q', 'category', 'type', 'brand', 'condition', 'sort', 'location', 'locationId', 'saleType', 'page', 'limit', 'cursor', 'minPrice', 'maxPrice', 'sellerId'];
  for (const injection of INJECTIONS)
    for (const param of params) {
      const started = Date.now();
      const r = await call('GET', `/listings?${param}=${encodeURIComponent(injection)}`);
      clean(`GET /listings?${param}=${injection}`, r);
      expect(Date.now() - started < 3000, `GET /listings?${param}=${injection} took ${Date.now() - started} ms (a time-based injection?)`);
      expect(!r.text.includes('scrypt$'), `GET /listings?${param}=${injection} returned a password hash`);
    }
  expect((await prisma.user.count()) === 44, 'an injection changed the users table');

  // ── Private fields stay private ──
  const listing = await call('GET', '/listings/attack-listing');
  expect(listing.status === 200 && !listing.text.includes('0799999999') && !listing.text.includes('Hidden Street'), 'the pickup is in the listing');

  // ── Log-in floods hit the limit ──
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++)
    statuses.push((await call('POST', '/auth/login', { headers: { 'X-Forwarded-For': '10.200.0.1' }, body: JSON.stringify({ email: 'attack.victim@example.com', password: 'wrong-password-here' }) })).status);
  expect(statuses.includes(429), `12 wrong passwords: ${[...new Set(statuses)].join(',')}, no 429`);

  // ── Bodies ──
  const huge = `{"a":"${'x'.repeat(200_000)}"}`;
  expect((await call('POST', '/auth/login', { body: huge })).status === 413, 'a 200 KB body is accepted');
  const deep = `${'['.repeat(5000)}${']'.repeat(5000)}`;
  clean('deep JSON', await call('POST', '/auth/send-otp', { body: deep }));
  clean('broken JSON', await call('POST', '/auth/send-otp', { body: '{"email":' }));
  clean('prototype pollution', await call('POST', '/auth/send-otp', { body: '{"__proto__":{"role":"admin"},"constructor":{"prototype":{"role":"admin"}},"email":"x@example.com"}' }));
  expect(({} as { role?: string }).role === undefined, 'prototype polluted');
  const update = await call('PATCH', '/me', { token: tokens.customer, body: '{"__proto__":{"role":"admin"},"role":"admin","suspended":false,"adminRole":"owner","verified":true,"name":"Customer Two"}' });
  const after = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
  expect(update.status === 200 && after.role === null && after.adminRole === null && after.verified === false, 'mass assignment on PATCH /me');

  // ── Junk at every route, as everyone ──
  const routes: { method: string; path: string }[] = [];
  const walk = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route) for (const method of Object.keys(layer.route.methods)) routes.push({ method: method.toUpperCase(), path: layer.route.path });
      else if (layer.handle?.stack) walk(layer.handle.stack);
    }
  };
  walk((app as any).router.stack);
  // Never hit the routes that would end the test's own sessions or accounts.
  const SKIP = new Set(['DELETE /me', 'POST /auth/logout', 'POST /admin/auth/logout']);
  const IDS = ['x', '0', '-1', "'", '%27%20OR%201%3D1', '..%2f..%2f.env', '%00', '%E0%A4%A', 'a'.repeat(5000), '9'.repeat(40), '<script>alert(1)</script>', 'SA-000000', 'null', 'undefined', '[]', '{}', '%F0%9F%98%80'];
  const BODIES = [
    '{}', '[]', 'null', '1', '"text"', '{"a":1}',
    JSON.stringify({ email: "' OR 1=1 --", password: { $ne: 1 }, code: ['123456'], name: 123, text: null }),
    JSON.stringify({ email: 'x'.repeat(10_000) + '@example.com', password: 'x'.repeat(10_000) }),
    JSON.stringify({ amountFils: 1e308, priceFils: -1e308, status: {}, reason: [], courierId: { a: 1 }, listingId: { in: ['x'] }, offerId: 1, delivery: 'x', pickup: [], reference: {}, text: { a: 1 }, ids: 'x' }),
    JSON.stringify({ limit: 1e308, before: 'not a date', q: {}, token: 'x', platform: 'ms-dos', language: 'klingon', items: 'x', storeId: {}, mode: 'x' }),
    JSON.stringify({ text: '\uD800', name: '\uDFFF\uD800', reason: '\u202Ename' }),
    JSON.stringify({ email: 'a@b.co\r\nBcc: everyone@example.com', name: 'x\r\nX: y' }),
  ];
  const QUERIES = ['', '?limit=-1', '?limit=1e308', '?limit=99999999999999999999', '?before=not-a-date', '?before=' + '9'.repeat(40), '?q[$ne]=1', '?status[]=x&status[]=y', '?days=-1', '?days=1e308', '?lat=NaN&lng=Infinity', '?page=-1', '?q=' + 'x'.repeat(5000)];
  let sent = 0;
  let limited = 0;
  const reachedHandler = new Set<string>();
  let turn = 0;
  const who: [string, () => string | undefined][] = [
    ['nobody', () => undefined],
    ['customer', () => crowd[turn++ % crowd.length]],
    ['courier', () => tokens.courier],
    ['admin', () => tokens.admin],
  ];
  for (const route of routes) {
    const name = `${route.method} ${route.path}`;
    if (SKIP.has(name) || route.path.startsWith('/auth/')) continue; // the auth routes are limited to a few tries: fuzzed apart below
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(route.method);
    const bodies = hasBody ? BODIES : [undefined];
    const queries = route.method === 'GET' ? QUERIES : [''];
    const ids = route.path.includes(':') ? IDS : ['x'];
    // Every id with the first body and query, then every body and query with the first id.
    const tries: [string, string, string | undefined][] = [
      ...ids.map((id): [string, string, string | undefined] => [id, queries[0], bodies[0]]),
      ...queries.slice(1).map((query): [string, string, string | undefined] => [ids[0], query, bodies[0]]),
      ...bodies.slice(1).map((body): [string, string, string | undefined] => [ids[0], queries[0], body]),
    ];
    for (const [label, tokenFor] of who)
      for (const [id, query, body] of tries) {
        const r = await call(route.method, route.path.replace(/:\w+/g, id) + query, { token: tokenFor(), body });
        sent++;
        if (r.status === 429) {
          limited++; // a limit did its job
          continue;
        }
        if (r.status !== 401 && r.status !== 403) reachedHandler.add(name);
        clean(`${name} as ${label} [${id.slice(0, 20)}]${query.slice(0, 30)} body ${(body ?? '').slice(0, 50)}`, r);
      }
  }
  console.log(`Fuzzed ${routes.length} routes with ${sent} requests: ${limited} stopped by a limit, ${reachedHandler.size} routes got past their guards.`);
  // If the limits or guards stopped nearly everything, a clean result would mean nothing.
  expect(limited < sent * 0.25, `${limited} of ${sent} requests were stopped by limits: the fuzzing wasn't real`);
  expect(reachedHandler.size > routes.length * 0.6, `only ${reachedHandler.size} of ${routes.length} routes were reached`);

  // The auth routes, a few at a time from fresh emails (they are rate limited per email).
  const authRoutes = routes.filter(r => r.path.startsWith('/auth/') && r.method === 'POST' && r.path !== '/auth/logout');
  for (const route of authRoutes)
    for (const body of BODIES.slice(0, 4)) clean(`POST ${route.path} ${body}`, await call('POST', route.path, { body }));

  // ── The accounts survived all that ──
  expect((await call('GET', '/me', { token: tokens.customer })).status === 200, 'the customer’s session survived');
  expect((await call('GET', '/admin/me', { token: tokens.admin })).status === 200, 'the admin’s session survived');
  const victimNow = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
  expect(victimNow.passwordHash === hash && !victimNow.suspended, 'the victim’s account was changed');
  const listingNow = await prisma.listing.findUniqueOrThrow({ where: { id: 'attack-listing' } });
  expect(listingNow.status === 'active' && listingNow.priceFils === 90_000, 'the victim’s listing was changed');
  await prisma.$disconnect();
} catch (error) {
  problem(`The run itself failed: ${error instanceof Error ? error.message : error}`);
} finally {
  stopServer();
}

const unique = [...new Set(problems)];
console.log(`${checks} checks.`);
for (const text of unique.slice(0, 60)) console.log(`PROBLEM  ${text}`);
if (unique.length > 60) console.log(`… and ${unique.length - 60} more`);
console.log(unique.length ? `${unique.length} problems.` : 'No problems found.');
process.exit(unique.length ? 1 : 0);
