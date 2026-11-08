import { env } from '../../env';
import { logger } from '../../lib/logger';

// Sending emails (BACKEND_PLAN B9.1, decision D3 = Postmark; backend/docs/EMAIL.md).
// MAIL_MODE=console prints them in the server's terminal (development);
// MAIL_MODE=postmark sends them. Codes never appear in the server's log.

export type Message = { to: string; subject: string; text: string; html: string; tag?: string };

export interface Mailer {
  /**
   * Resolves once the service has the email. Throws MailerUnavailable when it's
   * down or misconfigured (the caller answers 503). An address that can't get
   * email (invalid, bounced before) resolves quietly: nothing to tell the user
   * that wouldn't also reveal whether an account exists.
   */
  send(message: Message): Promise<void>;
}

export class MailerUnavailable extends Error {
  name = 'MailerUnavailable';
}

export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.log(`\n✉  To: ${to}\n   Subject: ${subject}\n   ${text.replace(/\n/g, '\n   ')}\n`);
  },
};

// Postmark's ErrorCodes about the recipient, not about Sahla's account:
// 300 invalid address, 406 inactive (bounced or marked as spam before).
const RECIPIENT_ERRORS = new Set([300, 406]);

/** https://postmarkapp.com/developer/api/email-api. `fetchImpl` is for the unit tests. */
export function postmarkMailer(
  { token, from, url = 'https://api.postmarkapp.com/email' }: { token: string; from: string; url?: string },
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return {
    async send({ to, subject, text, html, tag }) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': token },
          body: JSON.stringify({ From: from, To: to, Subject: subject, TextBody: text, HtmlBody: html, Tag: tag, MessageStream: 'outbound' }),
          signal: AbortSignal.timeout(8000),
        });
      } catch (error) {
        throw new MailerUnavailable(`Postmark unreachable: ${error instanceof Error ? error.message : error}`);
      }
      if (response.ok) return;
      const body = (await response.json().catch(() => ({}))) as { ErrorCode?: number; Message?: string };
      if (response.status === 422 && RECIPIENT_ERRORS.has(body.ErrorCode ?? -1)) {
        logger.warn({ postmarkError: body.ErrorCode }, 'Email not sent: the address can’t receive email');
        return;
      }
      // 401 wrong token, 422 e.g. 412 (account not approved yet) / 400 sender not verified, 5xx.
      throw new MailerUnavailable(`Postmark answered ${response.status}, ErrorCode ${body.ErrorCode}: ${body.Message}`);
    },
  };
}

export const mailer: Mailer =
  env.MAIL_MODE === 'postmark'
    ? postmarkMailer({ token: env.POSTMARK_SERVER_TOKEN!, from: env.MAIL_FROM })
    : consoleMailer;

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** One email in both languages: Arabic first (right to left), then English. */
function bilingual(parts: { ar: string[]; en: string[]; code?: string }) {
  const text = [...parts.ar, '', ...parts.en].join('\n');
  const block = (lines: string[], dir: 'rtl' | 'ltr', lang: string) =>
    `<div dir="${dir}" lang="${lang}" style="text-align:${dir === 'rtl' ? 'right' : 'left'}">` +
    lines.map(line => `<p style="margin:0 0 12px">${escape(line)}</p>`).join('') +
    '</div>';
  const html =
    '<!doctype html><html><body style="margin:0;background:#f4f4f0">' +
    '<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:Tahoma,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1d1d1b;background:#ffffff">' +
    '<p style="margin:0 0 24px;font-size:22px;font-weight:bold;color:#66824f">سهلة · Sahla</p>' +
    (parts.code ? `<p dir="ltr" style="margin:0 0 24px;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center">${escape(parts.code)}</p>` : '') +
    block(parts.ar, 'rtl', 'ar') +
    '<hr style="border:0;border-top:1px solid #e2e2dc;margin:20px 0">' +
    block(parts.en, 'ltr', 'en') +
    '</div></body></html>';
  return { text, html };
}

/** S1.3: someone tried to sign up with this email, which already has an account. */
export const accountExistsEmail = () => ({
  subject: 'لديك حساب في سهلة | You already have a Sahla account',
  tag: 'account-exists',
  ...bilingual({
    ar: ['طلب أحدهم إنشاء حساب في سهلة بهذا البريد، لكن لديك حساب بالفعل. سجّل الدخول، أو اختر «نسيت كلمة المرور» إن لزم.', 'إذا لم تكن أنت، تجاهل هذه الرسالة؛ حسابك آمن.'],
    en: ['Someone asked to create a Sahla account with this email, but you already have one. Log in, or choose "Forgot password" if you need to.', "If this wasn't you, ignore this email; your account is safe."],
  }),
});

/** S3.7: an alert, not a code: the seller's bank account was set or changed. */
export const payoutAccountEmail = (last4: string, replaced: boolean) => ({
  subject: 'تم تغيير الحساب البنكي | Your Sahla bank account changed',
  tag: 'payout-account',
  ...bilingual({
    ar: [
      `تم ${replaced ? 'تغيير' : 'إضافة'} الحساب البنكي لاستلام أموالك في سهلة، وينتهي بـ ${last4}.`,
      ...(replaced ? ['لحمايتك، لن نرسل أي دفعات إلى الحساب الجديد قبل مرور 24 ساعة.'] : []),
      'إذا لم تكن أنت، تواصل مع دعم سهلة فوراً وغيّر كلمة المرور.',
    ],
    en: [
      `The bank account for your Sahla money was ${replaced ? 'changed' : 'added'}. It ends in ${last4}.`,
      ...(replaced ? ['To protect you, nothing is sent to the new account for 24 hours.'] : []),
      "If this wasn't you, contact Sahla support right away and change your password.",
    ],
  }),
});

export const codeEmail = (purpose: 'signup' | 'reset' | 'payout', code: string) =>
  purpose === 'payout'
    ? {
        subject: `تأكيد الحساب البنكي: ${code} | Confirm your Sahla bank account`,
        tag: 'payout-code',
        ...bilingual({
          code,
          ar: [`رمز تأكيد الحساب البنكي: ${code}`, 'صالح لمدة 10 دقائق. إذا لم تطلبه، تواصل مع دعم سهلة فوراً.'],
          en: [`Your code to confirm the bank account: ${code}`, "Valid for 10 minutes. If you didn't ask for it, contact Sahla support right away."],
        }),
      }
    : purpose === 'signup'
    ? {
        subject: `رمز التحقق من سهلة: ${code} | Your Sahla code`,
        tag: 'signup-code',
        ...bilingual({
          code,
          ar: [`رمز التحقق: ${code}`, 'صالح لمدة 10 دقائق. إذا لم تطلبه، تجاهل هذه الرسالة.'],
          en: [`Your verification code: ${code}`, "Valid for 10 minutes. If you didn't ask for it, ignore this email."],
        }),
      }
    : {
        subject: `إعادة تعيين كلمة المرور: ${code} | Reset your Sahla password`,
        tag: 'reset-code',
        ...bilingual({
          code,
          ar: [`رمز إعادة التعيين: ${code}`, 'صالح لمدة 10 دقائق. إذا لم تطلبه، تجاهل هذه الرسالة؛ كلمة المرور لن تتغير.'],
          en: [`Your reset code: ${code}`, "Valid for 10 minutes. If you didn't ask for it, ignore this email; your password stays the same."],
        }),
      };
