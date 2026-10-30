import { Router, type Request } from 'express';
import { publicUrl } from '../../lib/publicUrl';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { finishSanad, startSanad, type SanadOutcome } from './sanad';

export const identityRoutes = Router();

// Sanad sends the user back here (the redirect URI registered with MoDEE).
const callbackUrl = (req: Request) => publicUrl(req, '/v1/id-verification/sanad/callback');

/** Starts a check: the app opens `redirectUrl` (Sanad). 503 SANAD_UNAVAILABLE until Sanad is live. */
identityRoutes.post('/me/id-verification/sanad', ...requireCustomer, async (req, res) => {
  res.json({ redirectUrl: await startSanad(currentUser(res.locals).id, callbackUrl(req)) });
});

/**
 * Sanad's answer, in the phone's browser. Shows a short page; back in the app,
 * the ID screen reloads the account (GET /me) and sees the Verified badge.
 */
identityRoutes.get('/id-verification/sanad/callback', async (req, res) => {
  const text = (key: string) => (typeof req.query[key] === 'string' ? (req.query[key] as string) : undefined);
  const outcome = await finishSanad({ state: text('state'), code: text('code'), error: text('error') }, callbackUrl(req));
  res
    .status(outcome === 'verified' ? 200 : 400)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(page(MESSAGES[outcome]));
});

const MESSAGES: Record<SanadOutcome, { ar: string; en: string }> = {
  verified: { ar: 'تم توثيق حسابك. ارجع إلى تطبيق سهلة.', en: 'Your account is verified. Go back to the Sahla app.' },
  cancelled: { ar: 'تم إلغاء التوثيق. يمكنك المحاولة مرة أخرى من التطبيق.', en: 'Verification was cancelled. You can try again from the app.' },
  expired: { ar: 'انتهت صلاحية هذا الرابط. ابدأ من جديد في التطبيق.', en: 'This link has expired. Start again in the app.' },
  id_used: { ar: 'هذه الهوية موثقة على حساب آخر في سهلة.', en: 'This ID already verifies another Sahla account.' },
  failed: { ar: 'تعذر التحقق مع سند. حاول لاحقاً.', en: "We couldn't check with Sanad. Please try later." },
};

const page = (message: { ar: string; en: string }) => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sahla</title><style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center;line-height:1.6}</style>
</head><body><h1>سهلة · Sahla</h1><p>${message.ar}</p><p dir="ltr">${message.en}</p></body></html>`;
