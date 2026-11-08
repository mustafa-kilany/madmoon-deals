import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeError, safePath, scrubText } from './scrub';

test('secrets and personal data are taken out of text', () => {
  const text = scrubText(
    'POST https://vision.googleapis.com/x?key=AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMY for lina.h@example.com, phone 0791234567, ' +
      'card 4242424242424242, iban JO94CBJO0010000000000131000302, Bearer abc.def.ghi, eyJhbGciOi.eyJzdWIi.sig, sahla_sk_abc123, /geocode?lat=31.95&lng=35.91',
  );
  for (const secret of ['AIza', 'lina.h', '0791234567', '4242424242424242', 'JO94', 'abc.def', 'eyJhbG', 'sahla_sk_', '31.95', '35.91'])
    assert.ok(!text.includes(secret), `${secret} in: ${text}`);
});

test('a Prisma error keeps its kind and code but never its text, which quotes the query', () => {
  const error = Object.assign(new Error('Invalid prisma.user.create() invocation: passwordHash: "scrypt$32768$secret" email: "x@y.co"'), { name: 'PrismaClientValidationError', code: 'P2002' });
  const safe = safeError(error);
  assert.equal(safe.type, 'PrismaClientValidationError');
  assert.equal(safe.code, 'P2002');
  assert.ok(!JSON.stringify(safe).includes('scrypt') && !JSON.stringify(safe).includes('x@y.co'), JSON.stringify(safe));
});

test('other errors keep a scrubbed message and only the stack’s location lines', () => {
  const safe = safeError(new Error('Could not reach lina@example.com'));
  assert.equal(safe.message, 'Could not reach [email]');
  assert.ok(safe.stack?.trim().startsWith('at '));
  assert.ok(!safe.stack?.includes('lina'));
  assert.deepEqual(safeError('a string'), { type: 'string', message: 'Not an Error object' });
});

test('a logged path keeps ids but not push tokens or query strings', () => {
  assert.equal(safePath('/v1/orders/SA-123456?x=1'), '/v1/orders/SA-123456');
  assert.equal(safePath(`/v1/me/devices/${'a'.repeat(160)}`), '/v1/me/devices/[long]');
});
