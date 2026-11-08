// npm run check:storage: does the configured storage really work and really keep private
// files private? Run it against real buckets before the first real upload (docs/STORAGE.md).

import { env } from '../src/env';
import { privateStorage, storage } from '../src/lib/storage';

if (env.STORAGE !== 's3') {
  console.error('STORAGE is local: this checks S3-compatible storage. Set STORAGE=s3 and its settings.');
  process.exit(1);
}

const name = `storage-check/${Date.now()}.jpg`;
const content = Buffer.from(`sahla storage check ${name}`);
let failed = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed++;
};

const publicRef = await storage.put(name, content);
const publicUrl = `${env.FILES_PUBLIC_URL}/${name}`;
const fromCdn = await fetch(publicUrl);
check('a public file can be read by anyone', fromCdn.ok && Buffer.from(await fromCdn.arrayBuffer()).equals(content), `${fromCdn.status} ${publicUrl}`);
check('with the right type', fromCdn.headers.get('content-type') === 'image/jpeg', fromCdn.headers.get('content-type') ?? 'none');

const privateRef = await privateStorage.put(name, content);
const read = await privateStorage.read(privateRef);
check('a private file can be read with the keys', !!read?.equals(content));

const endpoint = env.S3_ENDPOINT!.replace(/\/$/, '');
const direct = await fetch(`${endpoint}/${env.S3_PRIVATE_BUCKET}/${name}`);
check('a private file refuses a read with no keys', direct.status === 403 || direct.status === 400 || direct.status === 401, String(direct.status));
const viaCdn = await fetch(`${env.FILES_PUBLIC_URL}/${env.S3_PRIVATE_BUCKET}/${name}`);
check('a private file isn’t reachable from the public address', !viaCdn.ok, String(viaCdn.status));

await storage.remove(publicRef);
await privateStorage.remove(privateRef);
check('deleted files are gone', (await privateStorage.read(privateRef)) === undefined && !(await fetch(publicUrl, { cache: 'no-store' })).ok);

console.log(failed ? `${failed} problems.` : 'Storage is ready.');
process.exit(failed ? 1 : 0);
