import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakePayments } from './fake';

const returnUrl = 'http://127.0.0.1:4000/v1/payments/callback';
const charge = (cardToken: string) => fakePayments.charge({ cardToken, amountFils: 23_000, orderId: 'SA-100000', returnUrl });

test('the last 4 digits choose: paid, declined, or the bank’s card check', async () => {
  assert.equal((await charge('mock_visa_4242')).status, 'succeeded');
  assert.equal((await charge('mock_mastercard_0002')).status, 'failed');
  const check = await charge('mock_visa_3155');
  assert.equal(check.status, 'requires_action');
  assert.equal(check.paymentUrl, `http://127.0.0.1:4000/v1/payments/fake/bank/${check.ref}`);
  await assert.rejects(charge('4242424242424242')); // a card number is never a token
});

test('the card check: answered once, then the callback asks for the result', async () => {
  const { ref } = await charge('mock_visa_3155');
  assert.equal(fakePayments.answerCardCheck(ref, true), `${returnUrl}?ref=${ref}`);
  assert.equal(fakePayments.answerCardCheck(ref, false), undefined);
  assert.equal((await fakePayments.status(ref)).status, 'succeeded');

  const declined = await charge('mock_visa_3155');
  fakePayments.answerCardCheck(declined.ref, false);
  assert.equal((await fakePayments.status(declined.ref)).status, 'failed');
});

test('refunds only for paid payments; saved cards can be charged again', async () => {
  const paid = await charge('mock_visa_4242');
  await fakePayments.refund(paid.ref, 23_000);
  assert.ok(fakePayments.isRefunded(paid.ref));
  await assert.rejects(fakePayments.refund((await charge('mock_visa_0002')).ref, 23_000));

  const saved = await fakePayments.saveCard('mock_mastercard_5100');
  assert.deepEqual(saved, { token: 'fakecard_mastercard_5100', brand: 'mastercard', last4: '5100' });
  assert.equal((await charge(saved.token)).status, 'succeeded');
});
