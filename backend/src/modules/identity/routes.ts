import { Router, type Request } from 'express';
import { browserPage, type PageMessage } from '../../lib/page';
import { publicUrl } from '../../lib/publicUrl';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { finishSanad, startSanad, type SanadOutcome } from './sanad';
import { z } from 'zod';

export const identityRoutes = Router();

// Sanad sends the user back here (the redirect URI registered with MoDEE).
const callbackUrl = (req: Request) => publicUrl(req, '/v1/id-verification/sanad/callback');

/** Starts a check: the app opens `redirectUrl` (Sanad). 503 SANAD_UNAVAILABLE until Sanad is live. */
identityRoutes.post('/me/id-verification/sanad', ...requireCustomer, async (req, res) => {
  // B15.8: MoDEE's pledge: no Sanad lookup without the person's consent, recorded with the check.
  z.object({ consent: z.literal(true, { error: 'consent: agree to the Sanad consent first' }) }).parse(req.body ?? {});
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
    .send(browserPage(MESSAGES[outcome]));
});

const MESSAGES: Record<SanadOutcome, PageMessage> = {
  verified: { ar: 'تم توثيق حسابك. ارجع إلى تطبيق سهلة.', en: 'Your account is verified. Go back to the Sahla app.' },
  cancelled: { ar: 'تم إلغاء التوثيق. يمكنك المحاولة مرة أخرى من التطبيق.', en: 'Verification was cancelled. You can try again from the app.' },
  expired: { ar: 'انتهت صلاحية هذا الرابط. ابدأ من جديد في التطبيق.', en: 'This link has expired. Start again in the app.' },
  id_used: { ar: 'هذه الهوية موثقة على حساب آخر في سهلة.', en: 'This ID already verifies another Sahla account.' },
  failed: { ar: 'تعذر التحقق مع سند. حاول لاحقاً.', en: "We couldn't check with Sanad. Please try later." },
};

