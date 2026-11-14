// postmarkMailer against a pretend Postmark (no account needed), and the code emails.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeEmail, MailerUnavailable, postmarkMailer } from './mailer';

type Call = { url: string; init: RequestInit };

/** A fetch that records the request and answers `status` with `body`. */
const fakeFetch = (status: number, body: unknown, calls: Call[] = []) =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;

const message = { to: 'buyer@example.com', ...codeEmail('signup', '482913') };

test('sends Postmark the token, sender, both bodies and the tag', async () => {
  const calls: Call[] = [];
  const mailer = postmarkMailer({ token: 'server-token', from: 'Madmoon Deals <no-reply@sahla.jo>' }, fakeFetch(200, { ErrorCode: 0, Message: 'OK' }, calls));
  await mailer.send(message);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.postmarkapp.com/email');
  assert.equal((calls[0].init.headers as Record<string, string>)['X-Postmark-Server-Token'], 'server-token');
  const body = JSON.parse(String(calls[0].init.body));
  assert.equal(body.From, 'Madmoon Deals <no-reply@sahla.jo>');
  assert.equal(body.To, 'buyer@example.com');
  assert.equal(body.MessageStream, 'outbound');
  assert.equal(body.Tag, 'signup-code');
  assert.match(body.TextBody, /482913/);
  assert.match(body.HtmlBody, /dir="rtl"/);
  assert.match(body.HtmlBody, /482913/);
});

test('an address that can’t get email is quiet; account or network problems throw MailerUnavailable', async () => {
  const send = (status: number, body: unknown) => postmarkMailer({ token: 't', from: 'f' }, fakeFetch(status, body)).send(message);
  await send(422, { ErrorCode: 406, Message: 'Inactive recipient' });
  await send(422, { ErrorCode: 300, Message: 'Invalid email' });
  await assert.rejects(send(401, { ErrorCode: 10, Message: 'Bad token' }), MailerUnavailable);
  await assert.rejects(send(422, { ErrorCode: 412, Message: 'Account pending approval' }), MailerUnavailable);
  await assert.rejects(send(500, {}), MailerUnavailable);
  const offline = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  await assert.rejects(postmarkMailer({ token: 't', from: 'f' }, offline).send(message), MailerUnavailable);
});

test('code emails: Arabic and English, the code in the subject, HTML-safe', () => {
  for (const purpose of ['signup', 'reset'] as const) {
    const email = codeEmail(purpose, '000123');
    assert.match(email.subject, /000123/);
    assert.match(email.text, /[؀-ۿ]/);
    assert.match(email.text, /10 minutes/);
    assert.match(email.html, /lang="ar"/);
    assert.match(email.html, /lang="en"/);
  }
});

test('code emails: HTML-safe', () => {
  assert.match(codeEmail('signup', '<b>').html, /&lt;b&gt;/);
  assert.doesNotMatch(codeEmail('signup', '<b>').html, /<b>/);
});

test('code emails: "Arabic and English" title kept', () => {
  assert.match(codeEmail('reset', '111111').subject, /Reset your Madmoon Deals password/);
});
