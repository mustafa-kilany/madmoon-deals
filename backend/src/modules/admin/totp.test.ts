import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seal, unseal } from '../../lib/sealed';
import { currentStep, fromBase32, matchTotp, newTotpSecret, toBase32, totpCode } from './totp';

// RFC 6238 appendix B, SHA-1: the secret is the ASCII text "12345678901234567890".
const RFC_SECRET = toBase32(Buffer.from('12345678901234567890'));

test('codes match the RFC 6238 test vectors', () => {
  for (const [seconds, code] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ] as const)
    assert.equal(totpCode(RFC_SECRET, currentStep(seconds * 1000), 8), code);
});

test('base32 round-trips; new secrets are 32 characters (160 bits)', () => {
  const secret = newTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.equal(toBase32(fromBase32(secret)), secret);
});

test('a code is accepted now and one step either side, not two', () => {
  const secret = newTotpSecret();
  const now = Date.now();
  const step = currentStep(now);
  assert.equal(matchTotp(secret, totpCode(secret, step), now), step);
  assert.equal(matchTotp(secret, totpCode(secret, step - 1), now), step - 1);
  assert.equal(matchTotp(secret, totpCode(secret, step + 1), now), step + 1);
  assert.equal(matchTotp(secret, totpCode(secret, step - 2), now), undefined);
  assert.equal(matchTotp(secret, '12345', now), undefined);
  assert.equal(matchTotp(secret, 'abcdef', now), undefined);
});

test('sealed secrets open again, and not once changed', () => {
  const sealed = seal('JBSWY3DPEHPK3PXP');
  assert.notEqual(sealed, seal('JBSWY3DPEHPK3PXP')); // a new IV each time
  assert.equal(unseal(sealed), 'JBSWY3DPEHPK3PXP');
  const [v, iv, tag, data] = sealed.split('.');
  // Looks at the very letter it replaces, so the change is always a real one.
  assert.equal(unseal([v, iv, tag, data.slice(0, -2) + (data.at(-2) === 'A' ? 'B' : 'A') + data.slice(-1)].join('.')), undefined);
  assert.equal(unseal('nonsense'), undefined);
});
