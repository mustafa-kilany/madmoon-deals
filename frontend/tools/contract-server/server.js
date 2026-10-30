// Sahla contract server: a small, real HTTP implementation of the account
// endpoints in docs/API.md, used to prove the app's HTTP integration end to
// end before the production backend exists. NOT the backend: data lives in
// memory and is lost on restart (which also tests expired-token handling).
//
//   npm run contract-server            → http://localhost:4000/v1
//   Android emulator reaches it at     → http://10.0.2.2:4000/v1
//
// Every request is logged with its status, and uploads with their real size
// and detected file type.

/* eslint-env node */
/* global Request */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');

const PREFIX = '/v1';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_JSON_BYTES = 64 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MIN_PHOTO_BYTES = 1024;
// Area ids from GET /cities (src/services/mock/places.ts).
const CITIES = [
  'amman',
  'amman-jabal-al-qalaa',
  'amman-jabal-amman',
  'amman-weibdeh',
  'amman-abdali',
  'amman-jabal-hussein',
  'amman-jabal-al-nuzha',
  'amman-jabal-al-qusour',
  'amman-mahatta',
  'amman-jabal-al-nasr',
  'amman-jabal-al-taj',
  'amman-jabal-al-jofeh',
  'amman-ashrafieh',
  'amman-jabal-al-natheef',
  'amman-wehdat',
  'amman-ras-al-ain',
  'amman-muhajireen',
  'amman-jabal-al-zohour',
  'amman-shmeisani',
  'amman-wadi-saqra',
  'amman-gardens',
  'amman-rabiah',
  'amman-rawabi',
  'amman-um-uthaina',
  'amman-abdoun',
  'amman-dahiet-al-amir-rashid',
  'amman-sweifieh',
  'amman-deir-ghbar',
  'amman-jandaweel',
  'amman-kursi',
  'amman-um-al-summaq',
  'amman-khalda',
  'amman-tla-al-ali',
  'amman-madina-riyadiya',
  'amman-dabouq',
  'amman-bayader',
  'amman-wadi-al-seer',
  'amman-badr-al-jadida',
  'amman-iraq-al-amir',
  'amman-marj-al-hamam',
  'amman-naour',
  'amman-hesban',
  'amman-um-al-basateen',
  'amman-jubeiha',
  'amman-dahiet-al-rasheed',
  'amman-sweileh',
  'amman-kamaliya',
  'amman-abu-nseir',
  'amman-shafa-badran',
  'amman-tabarbour',
  'amman-abu-alia',
  'amman-dahiet-al-amir-hassan',
  'amman-ain-ghazal',
  'amman-hashmi',
  'amman-marka',
  'amman-quwaysimah',
  'amman-abu-alanda',
  'amman-jweideh',
  'amman-dahiet-al-yasmeen',
  'amman-muqabalain',
  'amman-um-qusair',
  'amman-khreibet-al-souq',
  'amman-bunayyat',
  'amman-yadudah',
  'amman-tunaib',
  'amman-sahab',
  'amman-muwaqqar',
  'amman-qastal',
  'amman-jiza',
  'irbid',
  'irbid-university-street',
  'irbid-al-hay-al-janoubi',
  'irbid-al-hay-al-sharqi',
  'irbid-beit-ras',
  'irbid-hakama',
  'irbid-kufr-youba',
  'irbid-huwwara',
  'irbid-aydoun',
  'irbid-sarih',
  'al-husn',
  'ramtha',
  'irbid-turra',
  'kourah',
  'al-taybeh',
  'mazar-shamali',
  'irbid-bani-kinanah',
  'irbid-kufr-soum',
  'irbid-um-qais',
  'irbid-wasatiyya',
  'north-shuna',
  'irbid-waqqas',
  'irbid-mashare',
  'zarqa',
  'zarqa-new-zarqa',
  'zarqa-awajan',
  'zarqa-ghuwairiya',
  'russeifa',
  'zarqa-birein',
  'zarqa-sukhna',
  'hashimiyya',
  'dhulail',
  'zarqa-hallabat',
  'azraq',
  'salt',
  'balqa-zay',
  'fuheis',
  'mahis',
  'ain-al-basha',
  'balqa-baqaa',
  'balqa-safut',
  'deir-alla',
  'south-shuna',
  'balqa-karameh',
  'balqa-dead-sea',
  'madaba',
  'madaba-mount-nebo',
  'madaba-main',
  'madaba-libb',
  'madaba-mukawir',
  'dhiban',
  'mafraq',
  'mafraq-rehab',
  'mafraq-balama',
  'khalidiya',
  'mafraq-zaatari',
  'mafraq-um-al-jimal',
  'mafraq-safawi',
  'ruwaished',
  'jerash',
  'souf',
  'jerash-sakib',
  'jerash-dibbeen',
  'jerash-burma',
  'jerash-bleila',
  'ajloun',
  'ajloun-anjara',
  'kufranjah',
  'ajloun-ishtafeina',
  'ajloun-ibbin',
  'ajloun-sakhra',
  'ajloun-orjan',
  'karak',
  'karak-mutah',
  'mazar-janoubi',
  'karak-adir',
  'karak-rabba',
  'al-qasr',
  'karak-ay',
  'karak-qatrana',
  'karak-ghor-al-mazraa',
  'ghor-al-safi',
  'tafilah',
  'busayra',
  'tafilah-qadisiyah',
  'tafilah-dana',
  'tafilah-hasa',
  'maan',
  'wadi-musa',
  'maan-taybeh',
  'maan-udhruh',
  'shoubak',
  'maan-ras-al-naqab',
  'maan-jafr',
  'maan-mudawwara',
  'aqaba',
  'aqaba-ayla',
  'aqaba-tala-bay',
  'quwayrah',
  'aqaba-disi',
  'aqaba-wadi-rum',
];
const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?w=150&h=150&fit=crop';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- storage (in memory) ----------

function createStore() {
  const users = new Map(); // id → account (with passwordHash, salt)
  const sessions = new Map(); // token → user id
  const store = { users, sessions };
  addAccount(store, {
    name: 'Ahmad',
    email: 'ahmad@sahla.jo',
    password: 'sahla1234',
    method: 'email',
    verified: false,
    card: { brand: 'visa', last4: '4242' },
  });
  // Demo courier (as in src/services/mock/users.ts): sees "Confirm a Delivery".
  addAccount(store, {
    name: 'Sahla Courier',
    email: 'courier@sahla.jo',
    password: 'sahla1234',
    method: 'email',
    verified: true,
    role: 'courier',
  });
  return store;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function passwordMatches(account, password) {
  const { hash } = hashPassword(password, account.salt);
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(account.passwordHash, 'hex'),
  );
}

function addAccount(store, { password, ...fields }) {
  const id = `user-${crypto.randomUUID()}`;
  const account = {
    id,
    cityId: 'amman',
    avatarUrl: DEFAULT_AVATAR,
    ...fields,
  };
  if (password) {
    const { salt, hash } = hashPassword(password);
    account.salt = salt;
    account.passwordHash = hash;
  }
  store.users.set(id, account);
  return account;
}

/** User as the contract defines it: no password data, no undefined fields. */
function publicUser(account) {
  const { salt, passwordHash, ...user } = account;
  return JSON.parse(JSON.stringify(user));
}

function openSession(store, account) {
  const token = crypto.randomBytes(32).toString('base64url');
  store.sessions.set(token, account.id);
  return { token, user: publicUser(account) };
}

function findByEmail(store, email) {
  for (const account of store.users.values())
    if (account.email === email) return account;
  return undefined;
}

// ---------- request helpers ----------

function authenticate(store, req) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  const userId = match && store.sessions.get(match[1]);
  const account = userId && store.users.get(userId);
  if (!account) throw new HttpError(401, 'UNAUTHORIZED', 'Not signed in');
  return { account, token: match[1] };
}

async function readJson(req) {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json'))
    throw new HttpError(400, 'VALIDATION', 'Expected application/json');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES)
      throw new HttpError(413, 'VALIDATION', 'Body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'VALIDATION', 'Invalid JSON');
  }
}

/** One uploaded image from a multipart body, checked by its actual bytes. */
async function readPhoto(req, field) {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('multipart/form-data'))
    throw new HttpError(400, 'VALIDATION', 'Expected multipart/form-data');
  if (Number(req.headers['content-length'] ?? 0) > MAX_UPLOAD_BYTES)
    throw new HttpError(413, 'VALIDATION', 'Upload too large');
  const form = await new Request('http://local/upload', {
    method: 'POST',
    headers: { 'content-type': type },
    body: Readable.toWeb(req),
    duplex: 'half',
  }).formData();
  const file = form.get(field);
  if (!file || typeof file === 'string')
    throw new HttpError(400, 'VALIDATION', `Missing file field "${field}"`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind || bytes.length < MIN_PHOTO_BYTES)
    throw new HttpError(
      422,
      'VALIDATION',
      `"${field}" is not a usable photo (${bytes.length} bytes, type ${
        kind ?? 'unknown'
      })`,
    );
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${kind}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), bytes);
  return {
    name,
    bytes: bytes.length,
    kind,
    clientName: file.name,
    clientType: file.type,
  };
}

function detectImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 4).toString('hex') === '89504e47') return 'png';
  if (
    b.subarray(0, 4).toString() === 'RIFF' &&
    b.subarray(8, 12).toString() === 'WEBP'
  )
    return 'webp';
  return undefined;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The emailed code for sign-up and password reset. A real backend sends a
// random code that expires (~10 minutes) and allows ~5 attempts.
const DEMO_CODE = '123456';

function checkCode(code) {
  if (code !== DEMO_CODE)
    throw new HttpError(422, 'INVALID_CODE', 'Wrong or expired code');
}

function endSessions(store, accountId) {
  for (const [token, id] of store.sessions)
    if (id === accountId) store.sessions.delete(token);
}

function validateSignUp({ name, email, password }) {
  if (typeof name !== 'string' || name.trim().length < 2)
    throw new HttpError(422, 'VALIDATION', 'name: at least 2 characters');
  if (typeof email !== 'string' || !EMAIL.test(email.trim()))
    throw new HttpError(422, 'VALIDATION', 'email: invalid');
  if (typeof password !== 'string' || password.length < 8)
    throw new HttpError(422, 'VALIDATION', 'password: at least 8 characters');
}

function socialAccount(store, method, name, email) {
  return (
    findByEmail(store, email) ??
    addAccount(store, { name, email, method, verified: false })
  );
}

// ---------- routes ----------

function routes(store) {
  const base = req => `http://${req.headers.host}`;
  return {
    'POST /auth/signup': async req => {
      const body = await readJson(req);
      validateSignUp(body);
      const email = body.email.trim().toLowerCase();
      if (findByEmail(store, email))
        throw new HttpError(409, 'EMAIL_TAKEN', 'Email already registered');
      checkCode(body.code);
      const account = addAccount(store, {
        name: body.name.trim(),
        email,
        password: body.password,
        method: 'email',
        verified: false,
      });
      return [201, openSession(store, account)];
    },

    'POST /auth/login': async req => {
      const { email, password } = await readJson(req);
      const account =
        typeof email === 'string' &&
        findByEmail(store, email.trim().toLowerCase());
      if (
        !account ||
        typeof password !== 'string' ||
        !passwordMatches(account, password)
      )
        throw new HttpError(
          401,
          'INVALID_CREDENTIALS',
          'Wrong email or password',
        );
      return [200, openSession(store, account)];
    },

    // Social log-in: a real backend verifies the provider's ID token; this
    // server accepts any call and signs in a fixed demo account per provider.
    'POST /auth/google': async () => [
      200,
      openSession(
        store,
        socialAccount(store, 'google', 'Google User', 'google.user@gmail.com'),
      ),
    ],
    'POST /auth/apple': async () => [
      200,
      openSession(
        store,
        socialAccount(store, 'apple', 'Apple User', 'user@apple.com'),
      ),
    ],

    // Codes: the demo code is always 123456 (DEMO_CODE).
    'POST /auth/send-otp': async req => {
      const { email } = await readJson(req);
      if (typeof email !== 'string' || !EMAIL.test(email.trim()))
        throw new HttpError(422, 'VALIDATION', 'email: invalid');
      if (findByEmail(store, email.trim().toLowerCase()))
        throw new HttpError(409, 'EMAIL_TAKEN', 'Email already registered');
      return [204];
    },

    // Always 204, account or not, so it can't be used to find accounts.
    'POST /auth/forgot-password': async req => {
      const { email } = await readJson(req);
      if (typeof email !== 'string' || !EMAIL.test(email.trim()))
        throw new HttpError(422, 'VALIDATION', 'email: invalid');
      return [204];
    },

    'POST /auth/reset-password': async req => {
      const { email, code, password } = await readJson(req);
      checkCode(code);
      const account =
        typeof email === 'string' &&
        findByEmail(store, email.trim().toLowerCase());
      if (!account)
        throw new HttpError(422, 'INVALID_CODE', 'Wrong or expired code');
      if (typeof password !== 'string' || password.length < 8)
        throw new HttpError(
          422,
          'VALIDATION',
          'password: at least 8 characters',
        );
      const { salt, hash } = hashPassword(password);
      account.salt = salt;
      account.passwordHash = hash;
      // Signed out everywhere else: the old password may have leaked.
      endSessions(store, account.id);
      return [200, openSession(store, account)];
    },

    'POST /auth/logout': async req => {
      const { token } = authenticate(store, req);
      store.sessions.delete(token);
      return [204];
    },

    'GET /me': async req => [200, publicUser(authenticate(store, req).account)],

    // A real backend also refuses (409 OPEN_ORDERS) while the user has orders
    // in escrow, deletes their listings, photos and card reference, and keeps
    // only what the law requires (e.g. completed payments).
    'DELETE /me': async req => {
      const { account } = authenticate(store, req);
      endSessions(store, account.id);
      store.users.delete(account.id);
      return [204];
    },

    'PATCH /me': async req => {
      const { account } = authenticate(store, req);
      const { name, cityId } = await readJson(req);
      if (
        name !== undefined &&
        (typeof name !== 'string' || name.trim().length < 2)
      )
        throw new HttpError(422, 'VALIDATION', 'name: at least 2 characters');
      if (cityId !== undefined && !CITIES.includes(cityId))
        throw new HttpError(
          422,
          'VALIDATION',
          `cityId: one of ${CITIES.join(', ')}`,
        );
      if (name !== undefined) account.name = name.trim();
      if (cityId !== undefined) account.cityId = cityId;
      return [200, publicUser(account)];
    },

    'POST /me/avatar': async req => {
      const { account } = authenticate(store, req);
      const photo = await readPhoto(req, 'avatar');
      account.avatarUrl = `${base(req)}/uploads/${photo.name}`;
      return [200, publicUser(account), photo];
    },

    // Like the real backend until Sahla has Sanad access (backend/docs/ID-VERIFICATION.md).
    'POST /me/id-verification/sanad': async req => {
      authenticate(store, req);
      throw new HttpError(
        503,
        'SANAD_UNAVAILABLE',
        'ID verification with Sanad is coming soon',
      );
    },

    // A real backend exchanges the token with the payment provider; the
    // app's mock provider issues "mock_<brand>_<last4>".
    'POST /me/payment-card': async req => {
      const { account } = authenticate(store, req);
      const { cardToken } = await readJson(req);
      const match = /^mock_([a-z]+)_(\d{4})$/.exec(cardToken ?? '');
      if (!match)
        throw new HttpError(422, 'VALIDATION', 'cardToken: unrecognised');
      account.card = { brand: match[1], last4: match[2] };
      return [200, publicUser(account)];
    },

    'DELETE /me/payment-card': async req => {
      const { account } = authenticate(store, req);
      delete account.card;
      return [200, publicUser(account)];
    },
  };
}

// ---------- server ----------

function createContractServer({ log = console.log } = {}) {
  const store = createStore();
  const table = routes(store);

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://local');
    let status = 500;
    let note = '';
    try {
      if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
        const file = path.join(UPLOAD_DIR, path.basename(url.pathname));
        if (!fs.existsSync(file))
          throw new HttpError(404, 'NOT_FOUND', 'No such file');
        status = 200;
        res.writeHead(200, {
          'Content-Type': `image/${path
            .extname(file)
            .slice(1)
            .replace('jpg', 'jpeg')}`,
        });
        res.end(fs.readFileSync(file));
        return;
      }
      const route = url.pathname.startsWith(PREFIX)
        ? table[`${req.method} ${url.pathname.slice(PREFIX.length)}`]
        : undefined;
      if (!route)
        throw new HttpError(
          404,
          'NOT_FOUND',
          `No route ${req.method} ${url.pathname}`,
        );
      const [code, body, upload] = await route(req);
      status = code;
      if (upload)
        note = `upload ${upload.kind} ${upload.bytes} bytes (client sent "${upload.clientName}", ${upload.clientType})`;
      if (body === undefined) {
        res.writeHead(code);
        res.end();
      } else {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      }
    } catch (error) {
      const known = error instanceof HttpError;
      status = known ? error.status : 500;
      note = known ? `${error.code}: ${error.message}` : String(error);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: known ? error.code : 'UNKNOWN',
            message: known ? error.message : 'Server error',
          },
        }),
      );
    } finally {
      const who = req.headers.authorization ? 'token' : 'guest';
      log(
        `${new Date().toISOString().slice(11, 19)} ${req.method} ${
          url.pathname
        } -> ${status} ` +
          `(${Date.now() - started}ms, ${who})${note ? `  ${note}` : ''}`,
      );
    }
  });
  server.store = store;
  return server;
}

module.exports = { createContractServer };

if (require.main === module) {
  const port = Number(process.env.PORT ?? 4000);
  createContractServer().listen(port, '0.0.0.0', () =>
    console.log(
      `Sahla contract server on http://localhost:${port}${PREFIX} ` +
        `(emulator: http://10.0.2.2:${port}${PREFIX}). Demo: ahmad@sahla.jo / sahla1234`,
    ),
  );
}
