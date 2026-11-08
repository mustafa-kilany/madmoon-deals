// SECURITY_PLAN S0.5: the whole flow with STORAGE=s3, against a tiny S3 server in this test,
// so it runs anywhere. It recomputes AWS's Signature Version 4 itself with node:crypto (not
// with the library that signed the request) and refuses a request whose signature is
// wrong, so a signing mistake fails here. A real bucket is still checked once, when one
// exists: npm run check:storage (backend/docs/STORAGE.md).

import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import sharp from 'sharp';

const SECRET = 'test-secret';
const hmac = (key: string | Buffer, text: string) => createHmac('sha256', key).update(text).digest();
const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** AWS Signature Version 4, from the published algorithm: is this request really signed with SECRET? */
function signatureValid(req: IncomingMessage, body: Buffer) {
  const match = /^AWS4-HMAC-SHA256 Credential=test-key\/(\d{8})\/([\w-]+)\/s3\/aws4_request, ?SignedHeaders=([^,]+), ?Signature=([0-9a-f]{64})$/.exec(req.headers.authorization ?? '');
  if (!match) return false;
  const [, date, region, signedHeaders, signature] = match;
  const amzDate = req.headers['x-amz-date'] as string;
  if (!amzDate?.startsWith(date)) return false;
  const payloadHash = req.headers['x-amz-content-sha256'] as string;
  if (payloadHash !== 'UNSIGNED-PAYLOAD' && payloadHash !== sha256(body)) return false;
  const names = signedHeaders.split(';');
  if (!names.includes('host') || !names.includes('x-amz-date')) return false;
  const canonicalHeaders = names.map(name => `${name}:${String(req.headers[name] ?? '').trim()}\n`).join('');
  const [path, query = ''] = (req.url ?? '').split('?');
  const canonical = [req.method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, date), region), 's3'), 'aws4_request');
  return hmac(key, toSign).toString('hex') === signature;
}

const objects = new Map<string, { body: Buffer; type?: string }>();
let badSignatures = 0;
let checkedSignatures = 0;
const s3 = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (!signatureValid(req, body)) {
      badSignatures++;
      return void res.writeHead(403).end('<Error>SignatureDoesNotMatch</Error>');
    }
    checkedSignatures++;
    answer(req, body, res);
  });
});
function answer(req: IncomingMessage, body: Buffer, res: import('node:http').ServerResponse) {
  const key = decodeURIComponent(req.url ?? '');
  if (req.method === 'PUT') {
    objects.set(key, { body, type: req.headers['content-type'] });
    res.writeHead(200).end();
  } else if (req.method === 'GET') {
    const object = objects.get(key);
    if (object) res.writeHead(200, { 'Content-Type': object.type ?? '' }).end(object.body);
    else res.writeHead(404).end();
  } else if (req.method === 'DELETE') {
    objects.delete(key);
    res.writeHead(204).end();
  } else res.writeHead(405).end();
}
await new Promise<void>(resolve => s3.listen(0, '127.0.0.1', resolve));

// Before the app reads its settings.
Object.assign(process.env, {
  STORAGE: 's3',
  S3_ENDPOINT: `http://127.0.0.1:${(s3.address() as AddressInfo).port}`,
  S3_ACCESS_KEY_ID: 'test-key',
  S3_SECRET_ACCESS_KEY: SECRET,
  S3_PUBLIC_BUCKET: 'pub',
  S3_PRIVATE_BUCKET: 'priv',
  FILES_PUBLIC_URL: 'https://files.example.com',
});
const { prisma } = await import('../db');
const { cleanUp, newPerson, startApi, PICKUP } = await import('./testkit');
const { privateStorage } = await import('./storage');

const api = startApi();
const EMAILS = ['s3.seller@example.com', 's3.buyer@example.com', 's3.admin@sahla.jo'];
type P = Awaited<ReturnType<typeof newPerson>>;
let seller: P, buyer: P, admin: P;
const keys = (prefix: string) => [...objects.keys()].filter(k => k.startsWith(prefix));

before(async () => {
  await api.ready;
  await cleanUp([], EMAILS);
  seller = await newPerson(api, EMAILS[0]);
  buyer = await newPerson(api, EMAILS[1]);
  admin = await newPerson(api, EMAILS[2], { role: 'admin', adminRole: 'owner' });
});
after(async () => {
  api.close();
  s3.close();
  await prisma.listing.deleteMany({ where: { sellerUser: { email: { in: EMAILS } } } });
  await cleanUp([], EMAILS);
  await prisma.$disconnect();
});

const jpeg = () => sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 10, g: 150, b: 90 } } }).jpeg().toBuffer();
const upload = async (path: string, field: string, who: P, extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(await jpeg())], { type: 'image/jpeg' }), 'photo.jpg');
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  const r = await api.raw(path, { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: form });
  return { status: r.status, body: (await r.json()) as any };
};

test('a listing photo goes to the public bucket; its URL is the public address and it works in a listing', async () => {
  const photo = await upload('/uploads/listing-photo', 'photo', seller);
  assert.equal(photo.status, 201);
  assert.match(photo.body.url, /^https:\/\/files\.example\.com\/listings\/[\w-]+\.jpg$/);
  assert.equal(keys('/pub/listings/').length, 2, 'full size + thumbnail');
  assert.equal(objects.get(keys('/pub/listings/')[0])?.type, 'image/jpeg');

  // Stored independently of the address.
  const row = await prisma.upload.findFirstOrThrow({ where: { userId: seller.id } });
  assert.match(row.url, /^\/files\/listings\//);

  // The app sends that URL back to publish, and every answer has the public address.
  const made = await api.call('POST', '/listings', seller, {
    category: 'furniture', type: 'sofas', titleAr: 'كنبة جميلة', titleEn: 'A nice sofa', priceFils: 50_000, imageUrls: [photo.body.url], condition: 'good',
    description: 'A corner sofa with washable covers, no tears or stains, easy to take apart.', locationId: 'amman', saleType: 'fixed', pickup: PICKUP,
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.match(made.body.imageUrl, /^https:\/\/files\.example\.com\/listings\/[\w-]+_400\.jpg$/);
  assert.equal(made.body.imageUrls[0], photo.body.url);
  assert.equal((await api.raw(`/../files/${row.url.slice(7)}`)).status, 404, 'nothing is served from this server');
});

test('a certificate original goes to the private bucket only, and only an admin can get it back', async () => {
  const check = await upload('/test-certificates', 'photo', seller, { category: 'mobiles', type: 'phones', brand: 'Apple' });
  assert.equal(check.status, 201, JSON.stringify(check.body));
  const row = await prisma.testCertificate.findUniqueOrThrow({ where: { id: check.body.id } });
  assert.match(row.photoUrl, /^private:certificates\//);
  assert.equal(keys('/priv/certificates/').length, 1);
  assert.equal(keys('/pub/certificates/').filter(k => k.includes('_blurred')).length, 1);
  assert.ok(!keys('/pub/').some(k => k.endsWith(`${row.photoUrl.slice('private:'.length)}`)), 'the original isn’t in the public bucket');

  const asAdmin = await api.raw(`/admin/certificates/${row.id}/photo`, { headers: { Authorization: `Bearer ${admin.token}` } });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.headers.get('cache-control'), 'private, no-store');
  assert.equal(asAdmin.headers.get('content-type')?.split(';')[0], 'image/jpeg');
  assert.ok((await asAdmin.arrayBuffer()).byteLength > 100);
  assert.equal((await api.raw(`/admin/certificates/${row.id}/photo`, { headers: { Authorization: `Bearer ${buyer.token}` } })).status, 403);
  assert.equal(badSignatures, 0, 'a request to storage had a wrong signature');
  assert.ok(checkedSignatures >= 5, `only ${checkedSignatures} signatures were checked`);
});

test('the checker itself refuses a wrong signature', async () => {
  const port = (s3.address() as AddressInfo).port;
  const before = badSignatures;
  const forged = await fetch(`http://127.0.0.1:${port}/priv/anything.jpg`, {
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=test-key/20261108/auto/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=${'0'.repeat(64)}`,
      'x-amz-date': '20261108T000000Z',
      'x-amz-content-sha256': sha256(''),
    },
  });
  assert.equal(forged.status, 403);
  assert.equal((await fetch(`http://127.0.0.1:${port}/priv/anything.jpg`)).status, 403, 'no signature at all');
  assert.equal(badSignatures, before + 2);
});

test('keys that could climb out of a folder are refused', async () => {
  await assert.rejects(privateStorage.put('../pub/x.jpg', Buffer.from('x')));
  assert.equal(await privateStorage.read('private:../pub/x.jpg'), undefined);
  assert.equal(await privateStorage.read('/files/x.jpg'), undefined);
  await privateStorage.remove('private:../../everything');
});

test('storage being down answers 500 with nothing about it, and doesn’t half-save', async () => {
  const before = await prisma.upload.count();
  await new Promise(resolve => s3.close(resolve));
  s3.closeAllConnections();
  const r = await upload('/uploads/listing-photo', 'photo', seller);
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: { code: 'INTERNAL', message: 'Something went wrong' } });
  assert.equal(await prisma.upload.count(), before);
});

test('deleting the account empties both buckets of its files', async () => {
  await new Promise<void>(resolve => s3.listen(Number(new URL(process.env.S3_ENDPOINT!).port), '127.0.0.1', resolve));
  assert.ok(objects.size >= 4);
  badSignatures = 0;
  assert.equal((await api.call('DELETE', '/me', seller)).status, 204);
  assert.deepEqual([...objects.keys()], [], 'left behind');
  assert.equal(badSignatures, 0);
});
