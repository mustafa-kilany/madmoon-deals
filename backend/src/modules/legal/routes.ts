import { legalDocs, LEGAL_VERSION, SANAD_CONSENT_VERSION, type LegalDocId } from '@/legal';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../env';

// The privacy policy and terms as public web pages (BACKEND_PLAN B15.8), from the
// same text as the app's screens (frontend/src/legal). The Play Store and App
// Store need the privacy policy's address: https://api.sahla.jo/v1/legal/privacy.

export const legalRoutes = Router();

const escape = (text: string) =>
  text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The current versions (the app compares the account's termsVersion). */
legalRoutes.get('/legal', (_req, res) => {
  res.json({ version: LEGAL_VERSION, sanadConsentVersion: SANAD_CONSENT_VERSION, supportEmail: env.SUPPORT_EMAIL });
});

legalRoutes.get('/legal/:doc', (req, res) => {
  const { doc, lang } = z
    .object({ doc: z.enum(['privacy', 'terms']), lang: z.enum(['ar', 'en']).default('ar') })
    .parse({ doc: req.params.doc, lang: req.query.lang });
  const page = legalDocs[doc as LegalDocId];
  const other = lang === 'ar' ? 'en' : 'ar';
  const sections = page.sections
    .map(s => `<h2>${escape(s.title[lang])}</h2>${s.body[lang].split('\n').map(p => `<p>${escape(p)}</p>`).join('')}`)
    .join('');
  res
    .set('Cache-Control', 'public, max-age=3600')
    .type('html')
    .send(
      `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title[lang])} · Madmoon Deals</title>` +
        '<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:2rem auto;padding:0 1rem;line-height:1.7;color:#2c1e16}h2{margin-top:2rem}</style>' +
        `</head><body><p><a href="?lang=${other}">${other === 'ar' ? 'العربية' : 'English'}</a></p>` +
        `<h1>${escape(page.title[lang])}</h1><p><small>${LEGAL_VERSION} · ${escape(env.SUPPORT_EMAIL)}</small></p>${sections}</body></html>`,
    );
});
