import { Router } from 'express';
import { env } from '../../env';
import { browserPage, type PageMessage } from '../../lib/page';
import { finishCardCheck, type CallbackOutcome } from '../orders/pay';
import { fakePayments } from './fake';

// The bank's card check (3-D Secure) happens in the phone's browser. The bank
// then sends the buyer here; this page says how it went, and the app (polling
// GET /orders/:id) shows the order paid. Registered with the provider as
// https://api.sahla.jo/v1/payments/callback.

export const paymentRoutes = Router();

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

paymentRoutes.get('/payments/callback', async (req, res) => {
  const outcome = await finishCardCheck(text(req.query.ref));
  res
    .status(outcome === 'unknown' ? 404 : 200)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(browserPage(MESSAGES[outcome]));
});

const MESSAGES: Record<CallbackOutcome, PageMessage> = {
  paid: { ar: 'تم الدفع. المبلغ محفوظ لدى سهلة حتى تستلم طلبك. ارجع إلى التطبيق.', en: 'Payment done. Sahla holds it until you receive your order. Go back to the Sahla app.' },
  already_paid: { ar: 'هذا الطلب مدفوع مسبقاً، وأُعيد هذا المبلغ إليك.', en: 'This order was already paid, so this payment was given back to you.' },
  sold: { ar: 'عذراً، اشترى شخص آخر هذا المنتج قبلك. أُعيد المبلغ إليك.', en: 'Sorry, someone else bought this first. Your money was given back.' },
  failed: { ar: 'لم يتم الدفع. يمكنك المحاولة مرة أخرى من التطبيق.', en: 'The payment didn’t go through. You can try again in the app.' },
  pending: { ar: 'ما زال البنك يتحقق من الدفع. ارجع إلى التطبيق بعد قليل.', en: 'The bank is still checking the payment. Go back to the app in a moment.' },
  unknown: { ar: 'لم نجد هذا الدفع.', en: 'We couldn’t find this payment.' },
};

// The pretend bank page (PAYMENT_MODE=fake): Approve / Decline, then our callback.
if (env.PAYMENT_MODE === 'fake') {
  paymentRoutes.get('/payments/fake/bank/:ref', (req, res) => {
    const ref = encodeURIComponent(req.params.ref);
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pretend bank</title><style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center}a{display:block;margin:1rem;padding:1rem;border-radius:.5rem;background:#eee;color:#000;text-decoration:none}</style>
</head><body><h1>Pretend bank card check</h1><p>Development only (PAYMENT_MODE=fake).</p>
<a href="${ref}/answer?approved=1">Approve</a><a href="${ref}/answer?approved=0">Decline</a></body></html>`);
  });
  paymentRoutes.get('/payments/fake/bank/:ref/answer', (req, res) => {
    const next = fakePayments.answerCardCheck(req.params.ref, req.query.approved === '1');
    if (next) res.redirect(303, next);
    else res.status(404).type('html').send(browserPage(MESSAGES.unknown));
  });
}
