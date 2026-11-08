// npm run check:pages (gate G6): the built dashboard, served with its production security headers
// (npm run preview), in real Chrome, as each admin type. Every page must load with no script error,
// no failed request and nothing blocked by the Content-Security-Policy, each admin must see only their
// own pages, and the authenticator QR code must show. Uses the installed Chrome through its
// debugging protocol; no packages.
//
//   ADMIN_URL   the preview's address (default http://localhost:5175)
//   API_URL     the backend behind it, for creating the test admins (default http://localhost:4001)
//   CHECK_2FA=1 only the QR-code check: the backend has ADMIN_2FA=on and admin@sahla.jo has no authenticator yet
//   SHOTS       a folder for screenshots

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ADMIN = process.env.ADMIN_URL ?? 'http://localhost:5175';
const API = (process.env.API_URL ?? 'http://localhost:4001') + '/v1';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9347;
const SHOTS = process.env.SHOTS;
const TOKEN_KEY = 'sahla-admin-token';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), 'sahla-check-pages-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1400,1000', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = pages.find(p => p.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* still starting */
    }
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await connect());
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let nextId = 1;
const waiting = new Map();
let issues = [];
let inFlight = 0;
let lastActivity = Date.now();
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const handler = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) handler?.reject(new Error(message.error.message));
    else handler?.resolve(message.result);
    return;
  }
  const { method, params } = message;
  if (method === 'Runtime.exceptionThrown') issues.push(`script error: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') issues.push(`console.error: ${params.args.map(a => a.value ?? a.description).join(' ')}`.slice(0, 300));
  if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    // A refused API call is shown on the page; the check for forbidden pages expects it.
    if (!/status of 40[13]/.test(params.entry.text)) issues.push(`browser: ${params.entry.text} ${params.entry.url ?? ''}`.slice(0, 300));
  }
  if (method === 'Network.requestWillBeSent') {
    inFlight++;
    lastActivity = Date.now();
  }
  if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
    inFlight = Math.max(0, inFlight - 1);
    lastActivity = Date.now();
  }
  if (method === 'Network.loadingFailed' && params.blockedReason) issues.push(`blocked (${params.blockedReason})`);
  if (method === 'Network.responseReceived' && params.response.status >= 500) issues.push(`${params.response.status} from ${params.response.url}`);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map(m => send(m)));
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1400, deviceScaleFactor: 1, mobile: false });

async function open(url) {
  inFlight = 0;
  await send('Page.navigate', { url });
  await sleep(250);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const loading = await evaluate(`document.readyState !== 'complete' || !!document.querySelector('.loading, [aria-busy="true"]')`).catch(() => true);
    if (!loading && inFlight === 0 && Date.now() - lastActivity > 400) return;
    await sleep(100);
  }
  issues.push(`still loading after 15 s (${inFlight} requests open)`);
}
const shot = async name => {
  if (!SHOTS) return;
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
};

const post = (url, body, token) =>
  fetch(API + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) });

async function adminLogin(email, password) {
  const r = await post('/admin/auth/login', { email, password });
  const body = await r.json();
  if (!body.token) throw new Error(`Log-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

const problems = [];
const fail = text => {
  problems.push(text);
  console.log(`FAIL  ${text}`);
};

async function checkQrCode() {
  // The real two-step log-in, typed into the real page, under the real policy.
  await open(`${ADMIN}/`);
  issues = [];
  const type = async (selector, text) => {
    await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  };
  await type('input[type="email"]', 'admin@sahla.jo');
  await type('input[type="password"]', 'sahla1234');
  await evaluate(`document.querySelector('form button[type="submit"], form button').click()`);
  for (let i = 0; i < 50 && !(await evaluate(`!!document.querySelector('img.qr')?.complete && document.querySelector('img.qr').naturalWidth > 0`)); i++) await sleep(100);
  const shown = await evaluate(`document.querySelector('img.qr')?.naturalWidth ?? 0`);
  if (shown < 100) fail(`the QR code didn't show under the policy (width ${shown}): ${issues.join(' | ')}`);
  else console.log(`PASS  the QR code shows under the policy (${shown} px)`);
  for (const issue of issues) fail(`2FA page: ${issue}`);
  await shot('2fa-qr');
}

async function checkPages() {
  // The policy really is on this page, or a clean result means nothing.
  const headers = (await fetch(`${ADMIN}/`)).headers;
  const csp = headers.get('content-security-policy') ?? '';
  for (const needed of ["script-src 'self'", "frame-ancestors 'none'", "default-src 'none'"]) if (!csp.includes(needed)) fail(`the policy lacks ${needed}`);
  await open(`${ADMIN}/`);
  const injected = await evaluate(`new Promise(resolve => {
    const s = document.createElement('script');
    window.__injected = false;
    s.textContent = 'window.__injected = true';
    document.head.appendChild(s);
    setTimeout(() => resolve(window.__injected), 50);
  })`);
  if (injected) fail('an injected inline script ran: the policy does not protect the token');
  else console.log('PASS  an injected inline script is blocked');
  const remote = await evaluate(`new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://example.com/evil.js';
    s.onload = () => resolve('loaded');
    s.onerror = () => resolve('blocked');
    document.head.appendChild(s);
  })`);
  if (remote !== 'blocked') fail('a script from another site loaded');
  else console.log('PASS  a script from another site is blocked');
  issues = [];

  const ownerToken = await adminLogin('admin@sahla.jo', 'sahla1234');
  const auth = { Authorization: `Bearer ${ownerToken}` };
  const orders = await (await fetch(`${API}/admin/orders?limit=5`, { headers: auth })).json();
  const users = await (await fetch(`${API}/admin/users?limit=5`, { headers: auth })).json();
  const stores = await (await fetch(`${API}/admin/refurbished/stores`, { headers: auth })).json().catch(() => []);
  const threads = await (await fetch(`${API}/admin/support`, { headers: auth })).json().catch(() => []);

  // One admin of each type, signed in the normal way.
  const TYPES = {
    owner: ['/', '/analytics', '/orders', '/payouts', '/users', '/reports', '/risk', '/certificates', '/refurbished', '/couriers', '/admins', '/support'],
    operations: ['/', '/orders', '/users', '/refurbished', '/couriers'],
    support: ['/', '/orders', '/users', '/reports', '/risk', '/certificates', '/support'],
    finance: ['/', '/analytics', '/orders', '/payouts', '/users'],
  };
  const ALL = TYPES.owner;
  const details = [
    ...(orders[0] ? [`/orders/${orders[0].id}`] : []),
    ...(users[0] ? [`/users/${users[0].id}`] : []),
  ];
  if (!orders[0]) fail('no orders in this database: run the Maestro flows first, or the order page goes unchecked');
  let loaded = 0;
  for (const [type, pages] of Object.entries(TYPES)) {
    const token =
      type === 'owner'
        ? ownerToken
        : await (async () => {
            const email = `check.${type}@sahla.jo`;
            await post('/admin/admins', { name: `Check ${type}`, email, adminRole: type }, ownerToken);
            const reset = await post('/auth/reset-password', { email, password: 'check-pages-password-1', code: '123456' });
            if (!reset.ok) throw new Error(`Couldn't set up ${email}: ${await reset.text()}`);
            return adminLogin(email, 'check-pages-password-1');
          })();
    await open(`${ADMIN}/`);
    await evaluate(`sessionStorage.setItem(${JSON.stringify(TOKEN_KEY)}, ${JSON.stringify(token)})`);
    const extra = type === 'owner' ? [...details, ...(stores[0] ? [`/refurbished/${stores[0].id}`] : []), ...(threads[0]?.userId ? [`/support/${threads[0].userId}`] : [])] : details;
    for (const page of [...pages, ...extra]) {
      issues = [];
      await open(ADMIN + page);
      const text = await evaluate('document.body.innerText');
      if (text.length < 40) issues.push(`nearly empty page: "${text}"`);
      if (/Something went wrong|Couldn.t load|Try again/i.test(text)) issues.push(`shows an error: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
      if (await evaluate(`document.body.innerHTML.includes('"pin"')`)) issues.push('a PIN field in the page');
      if (issues.length) for (const issue of issues) fail(`${type} ${page}: ${issue}`);
      else loaded++;
      if (type === 'owner') await shot(`owner${page.replace(/\W+/g, '-')}`);
    }
    // Only their own pages in the menu.
    const menu = await evaluate(`[...document.querySelectorAll('a.nav-link')].map(a => new URL(a.href).pathname)`);
    const unexpected = menu.filter(link => !pages.includes(link));
    const missing = pages.filter(link => !menu.includes(link));
    if (unexpected.length) fail(`${type} sees ${unexpected.join(', ')} in the menu`);
    if (missing.length) fail(`${type} doesn't see ${missing.join(', ')} in the menu`);
    // A page that isn't theirs, typed in by hand, shows no data.
    for (const page of ALL.filter(p => !pages.includes(p))) {
      issues = [];
      await open(ADMIN + page);
      const scriptErrors = issues.filter(i => i.startsWith('script error'));
      if (scriptErrors.length) fail(`${type} on forbidden ${page}: ${scriptErrors.join('; ')}`);
      const rows = await evaluate(`document.querySelectorAll('table tbody tr').length`);
      if (rows > 0) fail(`${type} sees ${rows} rows on ${page}`);
    }
    console.log(`PASS  ${type}: ${pages.length} pages in the menu, the others show nothing`);
    await evaluate(`sessionStorage.clear()`);
  }
  console.log(`${loaded} pages loaded clean.`);
}

let exitCode = 0;
try {
  if (process.env.CHECK_2FA) await checkQrCode();
  else await checkPages();
  exitCode = problems.length ? 1 : 0;
  console.log(problems.length ? `${problems.length} problems.` : 'No problems found.');
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
process.exit(exitCode);
