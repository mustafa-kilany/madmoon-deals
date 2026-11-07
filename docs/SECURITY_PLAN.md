# Sahla Security Plan

How Sahla's security gets checked before launch and kept checked after it. Written 2026-11-07 from an
audit of the code on `feat/backend-b8-admin` (`5a8e2d3`). **Edit freely**: tick items, add notes, move dates.

**Status:** ✅ done (with where it lives) · ⬜ to do · 🔴 found in the audit, must fix before launch ·
🟠 fix before launch if possible, else soon after · ⏸ waits for an external account

**How to use it**
- Work top to bottom: **S0** (fix what the audit found) → **S1–S8** (checks per area) → **S9** (test it like
  an attacker) → **S10** (launch gate) → **S11** (after launch, on a schedule).
- Each check says **how** to check it. A check is done when the "how" was run and the result is noted here.
- One fix = one commit, `fix(security): S0.3 …`, with a test that would have caught it.
- The standards behind the lists: OWASP **API Security Top 10** (backend), OWASP **MASVS** (mobile app),
  OWASP **ASVS** level 2 (dashboard and accounts), **PCI DSS SAQ A** (cards never touch our servers).

---

## What we protect (and from whom)

| Asset | Where | Worst case |
|---|---|---|
| Buyers' money in escrow | `Order`, `Payment`, `Payout`, the payment provider | Paying out without delivery, refunding twice, an order marked paid that wasn't |
| Accounts and sessions | `User`, `Session`, keychain in the app, `sessionStorage` in the dashboard | Account take-over, admin take-over |
| Personal data | names, emails, phones, delivery addresses, national ID hash, chats | A leak (Jordan's Personal Data Protection Law No. 24 of 2023) |
| Pickup addresses + phones | `Listing` (never in listing responses), `Order` | Burglary / harassment of sellers |
| Test-certificate originals (IMEI, serial) | `uploads-private` | Phone cloning / fraud |
| Admin powers | `/v1/admin/*`, dashboard | Refunds, suspensions, payouts by an attacker |
| Paid API keys | Google Maps, Vision, Postmark, Firebase, Anthropic | A big bill |
| Delivery PIN | Order, buyer's app | Courier "delivers" without the buyer → seller paid, buyer robbed |

**Attackers to plan for:** a curious user poking the API with their own token (most likely), a scammer
(fake listings, many accounts, card testing), a bot (sign-up spam, password guessing, scraping), a dishonest
courier or seller, someone who steals a phone or an admin's laptop, a leaked key in git or chat.

---

## S0 — Fix what the audit found (2026-11-07)

| # | Sev | Finding | Fix | How to check it's fixed |
|---|---|---|---|---|
| S0.1 | ✅ | **No rate limit on paying and saving cards** (`POST /orders/:id/pay`, `POST /me/payment-card`). A bot can test stolen card numbers through us ("card testing"): the provider then fines or closes the merchant account. | Per-user and per-IP limit (e.g. 5 card attempts / hour / user, 20 / day), `429 RATE_LIMITED`; risk flag after N declines. | e2e: the 6th attempt in an hour → 429. |
| S0.2 | ✅ | **No rate limit on endpoints that cost money or spam people**: `POST /test-certificates` (Google Vision, paid per page), `POST /uploads/listing-photo`, `POST /me/avatar`, `POST /chats/:id/messages`, `POST /listings/:id/offers`, `POST /listings/:id/bids`, `POST /reports`, `POST /listings`, `POST /orders`. Only log-in/sign-up, the dashboard log-in and `/geocode/reverse` have limits today. | One shared limiter helper with a budget per endpoint (e.g. certificates 10/day, uploads 60/hour, messages 30/min, reports 20/day). | e2e per endpoint: over the budget → 429. |
| S0.3 | 🔴 | **Android release is signed with the debug keystore** (`frontend/android/app/build.gradle`, `release { signingConfig signingConfigs.debug }`). Anyone has that key. | Make an upload keystore, keep it and its passwords **outside git** (password manager + an offline copy), sign release with it, turn on **Play App Signing**, add its SHA-1/256 to Firebase (Google sign-in breaks without it). | `keytool -list -printcert -jarfile app-release.aab` shows our certificate, not "Android Debug". |
| S0.4 | ✅ | **`PUBLIC_URL` is optional in production**: file URLs are then built from the request's `Host` header (`backend/src/lib/publicUrl.ts`), so a forged header puts an attacker's domain into photo URLs that get cached. | `env.ts`: refuse to start in production without `PUBLIC_URL` (same style as the other `.refine` rules). | Start with `NODE_ENV=production` and no `PUBLIC_URL` → refuses. |
| S0.5 | 🔴 | **Photos are on the API server's disk** (`lib/storage.ts`, D1 not built). On Railway/Render-style hosting the disk is wiped on deploy, and private certificate originals sit next to the app. | Build the R2/S3 storage behind the same interface: a **public** bucket for listing photos (random names), a **private** bucket for certificate originals (dashboard reads via short-lived signed URLs or the existing proxy). | Upload, redeploy, photo still there; a certificate original's URL without a signature → 403. |
| S0.6 | 🔴 | **Google Maps key was pasted in a chat** (2026-11-02). | Regenerate it in Google Cloud, restrict it to the Geocoding API (+ the server's outgoing IP once hosted), set a daily quota and a budget alert. | Old key → `REQUEST_DENIED`; Cloud console shows the restrictions. |
| S0.7 | 🟠 | **Firebase API key is in git** (`frontend/android/app/google-services.json`). This is normal for Firebase (it is a client id, not a secret) **only if** it is restricted. | In Google Cloud → Credentials: restrict that key to Android apps (`package name` + release SHA-1) and to the Firebase APIs it needs. Check whether the GitHub repo is private. | Key's page shows "Android apps" restriction. |
| S0.8 | ✅ | **No CORS rule yet**, needed when the dashboard moves to `admin.sahla.jo` (B8.6). The risk is the opposite fix: `origin: *`. | Allow exactly `https://admin.sahla.jo` (and `http://localhost:5174` only outside production), on `/v1/admin/*` only. The phone app needs no CORS. | `curl -H "Origin: https://evil.example" …/v1/admin/me -I` → no `Access-Control-Allow-Origin`. |
| S0.9 | 🟠 | **Rate limits are kept in memory**: they reset on restart and don't add up across 2+ servers. | Fine with one server. With 2+ (B12), use a shared store (PostgreSQL table or Redis) for `express-rate-limit`. | Note the server count in B12.2; revisit if > 1. |
| S0.10 | 🟠 | **No error tracking or alerts** (Sentry pending, B12.1/B12.4). Attacks show up as error spikes nobody sees. | Sentry on backend + app + dashboard (scrub tokens, passwords, PINs, card data, coordinates); uptime check; alert on 5xx rate and on 401/429 spikes. | A thrown test error appears in Sentry with no secrets in it. |
| S0.11 | 🟠 | **The Apple button on Android sends no token** (`AuthScreen.tsx` → `logInApple.mutate(undefined)`): it always fails. Not a hole, but a broken auth path is where people add quick hacks. | Hide the Apple button until Apple sign-in is built (iOS only, B10). | No Apple button on Android. |

---

## S1 — Accounts, log-in and sessions (backend)

Already in place: ✅ scrypt passwords · ✅ HS256 JWT **plus a database session per token** (log-out, reset,
delete and suspend revoke at once) · ✅ HMAC'd email codes · ✅ rate limit per IP + email on auth → 429 ·
✅ `DEV_EMAIL_CODE` refused in production · ✅ staff domain refused at public sign-up · ✅ Google/Apple ID
tokens checked against the providers' keys and our client ids; JWKS URLs locked in production · ✅ suspended
users get 403 · ✅ app tokens can't open `/admin`, dashboard tokens open nothing else.

| # | Check | How |
|---|---|---|
| ⬜ S1.1 | `JWT_SECRET` in production is new, random (≥ 32 bytes), only in the host's secret settings, different from development. | `npm run secret`; never in `.env` committed; compare to dev = different. |
| ⬜ S1.2 | Password rules: minimum length ≥ 8 (prefer 10), max length capped (e.g. 128, scrypt cost), common-password list refused. | Read `password.ts` + sign-up schema; e2e with `password123`. |
| ⬜ S1.3 | No account enumeration: sign-up, log-in, forgot-password give the same answer and similar timing for "no such email". | Call each with a known and an unknown email; compare body and time. |
| ⬜ S1.4 | Email codes: 6 digits, expire (≤ 10 min), one use, ≤ 5 wrong tries then a new code needed. | Read `codes.ts`; e2e: 6th wrong try refused even with the right code. |
| ⬜ S1.5 | Reset password signs out every other session; changing the email (if allowed) needs the code to the new address. | e2e: two sessions, reset, the old token → 401. |
| ⬜ S1.6 | Session length: 60 days for the app is long. Decide: keep 60, or 30 + sliding renewal. Admin 12 h ✅. | Decision note here. |
| ⬜ S1.7 | `alg` is pinned to HS256 when verifying (no `none`, no RS/HS confusion). | Read `tokens.ts` (`jwtVerify(…, { algorithms: ['HS256'] })`); unit test with an `alg: none` token. |
| ⬜ S1.8 | Google sign-in links to an existing account **only when Google says the email is verified** (`email_verified`). | Read `social.ts`; unit test with `email_verified: false`. |
| ⬜ S1.9 | Account deletion really deletes or anonymises personal data (keeping only what law/accounting needs). | Delete a test account, look at every table for its email/name/phone. |

## S2 — Who can see and change what (authorization / IDOR)

The #1 API risk. Every id in a URL or body must be checked against the caller.

Already in place: ✅ `requireUser` / `requireCustomer` / `requireCourier` / `requireAdmin` · ✅
`staffOnly.e2e.ts` checks every customer endpoint refuses couriers · ✅ order lookups pass the caller's id
(`getOrder(userId, id)`), chats too (`listMessages(userId, …)`) · ✅ pickup address never in listing responses
· ✅ the PIN is never shown in the dashboard.

| # | Check | How |
|---|---|---|
| ⬜ S2.1 | **Two-user test for every endpoint with an id**: user B tries user A's order, chat, messages, offer, listing edit/delete, certificate, upload, device token, blocked list. All → 404 (or 403). | One e2e file `authz.e2e.ts` looping a table of endpoints (like `staffOnly.e2e.ts`). Add each new endpoint to it. |
| ✅ S2.2 | A courier only sees **their own** assigned deliveries; can't mark picked-up / confirm another courier's order. | e2e with two couriers. |
| ⬜ S2.3 | A seller sees the buyer's delivery details **only** after payment, and a courier only while assigned. | e2e: before pay → no address; after delivery → decide if it should disappear. |
| ⬜ S2.4 | Mass assignment: `PATCH /me` and `PATCH /listings/:id` ignore `role`, `verified`, `suspended`, `status`, `sellerUserId`, prices of others… (zod `.strict()` or picked fields). | e2e: send `{"role":"admin"}` → no change. |
| ⬜ S2.5 | Store API keys (refurbished import) only touch **their own store**; revoked keys → 401. | e2e with two stores. |
| ⬜ S2.6 | Responses don't leak fields: no `passwordHash`, `cardToken`, `pin`, `nationalIdHash`, `pickupPhone`, other users' emails in any JSON. | Grep the `toApi*` shape functions; e2e snapshot of each response's keys. |

## S3 — Money: orders, escrow, payments, payouts

Already in place: ✅ the server prices every order (client prices ignored) · ✅ row locks so one payment wins,
late payments refunded · ✅ the bank callback **asks the provider** for the status (doesn't trust the URL) ·
✅ fake provider refused in production · ✅ PIN locks after 5 wrong tries (counted before compare) · ✅
refunds admin-only and logged · ✅ cards tokenised by the provider (`User.cardToken`), no card numbers stored.

| # | Check | How |
|---|---|---|
| ✅ S3.1 | Card-testing limit (= S0.1). | See S0.1. |
| ⬜ S3.2 | **Card numbers never reach our server.** With the real provider (D2) use its hosted page or SDK card field, so we stay in PCI **SAQ A**. Today the app has a typed card field → `tokenizeCard`; check where that number goes. | Read `frontend/src/services/payments`; with D2, network capture: no PAN in any request to `api.sahla.jo`. |
| ⬜ S3.3 | The real provider's callback / webhook is **signed** and the signature is checked; amounts and currency compared to the order. | Code review at B7.9; e2e with a forged callback → ignored. |
| ⬜ S3.4 | Idempotency: pay twice, refund twice, mark payout sent twice, confirm delivery twice → one effect. | e2e double calls in parallel (`Promise.all`). |
| ⬜ S3.5 | Amounts in integer fils everywhere; no negative or zero prices, offers or bids; max price cap. | zod schemas; e2e with `-1`, `0`, `1e15`. |
| ⬜ S3.6 | The PIN: 4 digits = 10 000 options; 5 tries before lock ✅. Check it's random (`crypto.randomInt`), not logged, only shown to the buyer. | Read `pay.ts`; grep logs for the PIN. |
| ⬜ S3.7 | Payout bank details: who can change them, and does a change need re-login / a code? A changed IBAN before payout is the classic fraud. | Design decision when payouts are built for real. |
| ⬜ S3.8 | Money reconciliation once a day: provider's settled total = our `Payment` succeeded − refunds. Alert on a difference. | Script/job at B7.9. |

## S4 — Uploads and files

Already in place: ✅ file type from the bytes, EXIF (GPS) stripped, re-encoded with `sharp` · ✅ random names ·
✅ listings accept only the caller's own unused uploads · ✅ certificate originals private, IMEI/serial blurred
for buyers · ✅ private paths can't leave their folder · ✅ JSON body limit 64 kb (5 MB for imports).

| # | Check | How |
|---|---|---|
| 🔴 S4.1 | Cloud storage with a private bucket (= S0.5). | See S0.5. |
| ⬜ S4.2 | Upload size limit and pixel limit (decompression bomb: a tiny PNG that expands to 50 000 × 50 000). `sharp({ limitInputPixels })`. | Upload a bomb image → 4xx, server memory stays flat. |
| ⬜ S4.3 | SVG, HTML, PDF uploads refused (only JPEG/PNG/WebP/HEIC). | e2e upload of an `.svg` renamed `.jpg` → refused. |
| ⬜ S4.4 | Photos served with `X-Content-Type-Options: nosniff` and the right `Content-Type` (from the CDN too). | `curl -I` a photo URL. |
| ⬜ S4.5 | CSV import: formula injection (`=HYPERLINK(…)` in a cell) can't reach an admin's Excel when exported; 1000-row cap ✅. | Import a row starting with `=`; check it's stored/escaped. |

## S5 — Dashboard (admin) and staff

Already in place: ✅ password → 5-minute ticket → TOTP code (secret AES-GCM encrypted, each code once) ·
✅ 12 h tokens, `scope: admin` · ✅ production refuses `ADMIN_2FA=off` · ✅ audit log with IP · ✅ token in
`sessionStorage` (gone when the browser closes) · ✅ limits on both log-in steps.

| # | Check | How |
|---|---|---|
| ⬜ S5.1 | **Turn 2FA back on** before hosting (remove `ADMIN_2FA=off`), each admin scans a new QR. | Production start refuses `off` ✅; log in once to confirm. |
| ⬜ S5.2 | Change the seeded `admin@sahla.jo / sahla1234`: **the seed must never run in production**. Create real admins with `npm run staff`. | `db:seed` refuses when `NODE_ENV=production`; no `sahla1234` account in production. |
| ⬜ S5.3 | Dashboard hosting headers: strict **Content-Security-Policy** (no inline scripts), `frame-ancestors 'none'`, HSTS, `Referrer-Policy: no-referrer`. A CSP is what protects the `sessionStorage` token from XSS. | securityheaders.com on `admin.sahla.jo` → A. |
| ⬜ S5.4 | XSS: user text (listing titles, chat, report reasons, names) shown in the dashboard is escaped (React does this; check no `dangerouslySetInnerHTML`). | `grep -r dangerouslySetInnerHTML admin/src`; create a listing titled `<img src=x onerror=alert(1)>` and open it in the dashboard. |
| ⬜ S5.5 | Optional: allow `/v1/admin/*` only from the office IP or a VPN / Cloudflare Access. Decide at B12. | Decision note. |
| ⬜ S5.6 | Least privilege: decide if all admins need refunds + payouts, or split roles (support vs finance). | Decision note; roles later if needed. |
| ⬜ S5.7 | Staff leaving: disable courier/admin account → their sessions die at once. | e2e: disable → old token 401/403 ✅ check. |
| ⬜ S5.8 | `reset-2fa` and `staff` commands run only on the server by the owner; nobody else has production shell/DB access. | Host access list. |

## S6 — Mobile app (Android now, iOS later) — OWASP MASVS

Already in place: ✅ token in the device keychain (`react-native-keychain`) · ✅ `allowBackup="false"` · ✅
cleartext HTTP only in debug builds · ✅ R8 shrinking in release · ✅ only area-level location sent, no
coordinates stored.

| # | Check | How |
|---|---|---|
| 🔴 S6.1 | Release keystore + Play App Signing (= S0.3). | See S0.3. |
| ⬜ S6.2 | Release build talks only to `https://api.sahla.jo` (no `10.0.2.2`, no contract server, no `mock: true` services). | Decompile the release APK (`jadx`) and search `10.0.2.2`, `mock`; check `config.ts` at build time. |
| ⬜ S6.3 | No secrets in the app bundle: only public ids (Google web client id, Firebase config). No Maps/Vision/Postmark keys. | `jadx` + grep `AIza`, `sk-`, `postmark` in the APK; only the restricted Firebase key should appear. |
| ⬜ S6.4 | Logs: no tokens, PINs, emails or card digits in `console.log` in release (strip with babel `transform-remove-console`). | `adb logcat` while signing in / paying on a release build. |
| ⬜ S6.5 | The delivery PIN and card screens hide from screenshots / the app switcher (`FLAG_SECURE` on those screens). | Take a screenshot on the PIN screen → blocked. |
| ⬜ S6.6 | Push notifications don't carry private data (no PIN, no address) in the visible text. | Read `notify.ts` texts. |
| ⬜ S6.7 | Deep links / push taps can't open another user's order (the server check in S2 is what matters). | Tap a crafted `order` push with someone else's id → "not found". |
| ⬜ S6.8 | Optional later: certificate pinning, root/jailbreak detection, Play Integrity on sign-up and payment. Decide after launch based on fraud seen. | Decision note. |
| ⬜ S6.9 | Permissions: only camera, photos, coarse+fine location (checkout), notifications. Nothing unused in the manifest. | Read the merged release manifest. |

## S7 — Server, database, hosting, secrets

Already in place: ✅ `helmet` headers · ✅ `x-powered-by` off · ✅ `TRUST_PROXY` setting · ✅ `pino` logs
without query strings, headers or bodies · ✅ `.env` refuses dangerous production settings · ✅ Prisma
(parameterised queries).

| # | Check | How |
|---|---|---|
| ⬜ S7.1 | HTTPS only (`api.sahla.jo`, `admin.sahla.jo`), HSTS, TLS 1.2+. | ssllabs.com → A. |
| ⬜ S7.2 | Database not reachable from the internet (private network / IP allow list), its own strong password, TLS, the app's DB user is not a superuser. | `psql` from home → refused. |
| ⬜ S7.3 | Every secret only in the host's secret store: `JWT_SECRET`, `ID_HASH_SECRET`, `DATABASE_URL`, Postmark, Maps, Vision, Firebase service account, Anthropic, payment keys, the TOTP sealing key. Listed with who can see it and how to rotate it. | Table at the end of this file; `git log -p` + `gitleaks detect` → nothing. |
| ⬜ S7.4 | Raw SQL (`$queryRaw`) only with tagged templates, never string-built (`$queryRawUnsafe`). | `grep -rn "queryRawUnsafe\|executeRawUnsafe" backend/src` → none, or each reviewed. |
| ⬜ S7.5 | Outgoing calls (geocoder, Google, Firebase, Vision) have timeouts and never fetch a URL a user typed (SSRF). | Read each `fetch(`; grep for user-controlled URLs. |
| ⬜ S7.6 | Error answers in production show no stack traces or SQL. | Force a 500 in staging; body is the standard error only. |
| ⬜ S7.7 | Backups: daily, encrypted, kept 30 days, **a restore tested** (B12.3). | Restore into a fresh DB and run the e2e smoke. |
| ⬜ S7.8 | Logs kept e.g. 30–90 days; contain no personal data beyond IP/user id (S0.10 scrubbing). | Read a day of production logs. |
| 🟠 S7.9 | Dependencies: `npm audit` clean (or each finding noted), Dependabot / Renovate on, lockfiles committed, no `latest` versions. **2026-11-07:** backend 0, admin 0, frontend 13 (8 high): `@grpc/grpc-js` / `firebase` JS SDK pulled in by `@react-native-firebase` (Node/web code, not the Android native path; npm's "fix" is a downgrade to v20, don't), `body-parser`, `joi`, `postcss-selector-parser`, `deepmerge` (Metro / RN CLI build tools, not in the app). Re-check when `@react-native-firebase` updates. | `npm audit --omit=dev` in backend, frontend, admin. |
| ⬜ S7.10 | CI checks: add `gitleaks` (secrets), `npm audit --audit-level=high`, and CodeQL (free on GitHub) to `.github/workflows`. | A PR with a fake key fails CI. |

## S8 — Privacy, ID data and legal

| # | Check | How |
|---|---|---|
| ⬜ S8.1 | Privacy policy + terms in the app and on the site, accepted at sign-up (stored with date/version). | Sign up → acceptance row exists. |
| ⬜ S8.2 | Sanad: the **consent screen and stored consent record** before every lookup (MoDEE's pledge: 500 JOD per lookup without consent). Only the fields we asked for. National number only as a keyed hash ✅. | e2e: verification without a consent record → refused. |
| ⬜ S8.3 | Data retention: chats, delivery addresses on completed orders, certificate originals, logs, deleted accounts: how long each is kept, and a job that deletes it. | Table in the privacy policy + cleanup jobs. |
| ⬜ S8.4 | A way for users to export/delete their data (delete ✅ `DELETE /me`). | Doc + test. |
| ⬜ S8.5 | A breach plan: who to call, how to revoke all sessions (`JWT_SECRET` rotation signs everyone out), how to tell users. | One page, below. |

## S9 — Test it like an attacker (before launch)

1. **Automated scan** of the staging API with **OWASP ZAP** (free): import `docs/API.md` routes or proxy the app
   through it; fix every High/Medium.
2. **Manual API test** with two customer accounts, one courier, one admin, using Postman/Bruno or `curl`:
   the S2 table, S3.4 double calls, S3.5 bad amounts, S1.3 enumeration, S4 upload tricks.
3. **Mobile check**: release APK through **MobSF** (free, static analysis) + the S6 items by hand.
4. **Dashboard check**: ZAP against `admin.sahla.jo` staging + the S5 items.
5. **Load + abuse**: B12.5 load test, plus a burst on each S0.2 endpoint to see the 429s.
6. **Optional, after launch revenue**: a paid penetration test by a Jordanian or regional firm, and a
   small bug-bounty / `security.txt` contact (`https://sahla.jo/.well-known/security.txt`).

## S10 — Launch gate (all must be ✅)

- [ ] Every 🔴 in S0 fixed with a test.
- [ ] S1–S8 checked; anything left open has a written reason and a date.
- [ ] S9 scans: no open High; Mediums have a plan.
- [ ] Production `.env` reviewed line by line against `env.ts` (no `fake`, no `console`, no `off` for 2FA,
      `PUBLIC_URL` set, real secrets).
- [ ] Backups restored once; alerts reach the owner's phone.
- [ ] Seed data and demo accounts absent from production.
- [ ] Keys restricted and budget alerts on (Maps, Vision, Firebase, Postmark, Anthropic).

## S11 — After launch (on a schedule)

| When | What |
|---|---|
| Daily (automatic) | Error/429/401 alerts, money reconciliation (S3.8), backup ran. |
| Weekly | Dependabot PRs merged; risk-flag queue cleared; look at the top rate-limited IPs. |
| Monthly | `npm audit` all three projects; review admin list and staff accounts; review audit log for odd refunds/payouts; check API key usage vs budget. |
| Every 3 months | Restore test; rotate the most exposed keys; re-run ZAP + MobSF; review this file. |
| Every release | The S2 authz e2e passes (new endpoints added); no new permissions in the manifest; release built with the upload key. |
| On an incident | S8.5 breach plan. |

---

## Secrets register (fill in as they are created)

| Secret | Used by | Stored in | Who can see | How to rotate |
|---|---|---|---|---|
| `JWT_SECRET` | backend | host secrets | owner | change → everyone signs in again |
| `ID_HASH_SECRET` | backend (Sanad) | host secrets | owner | **never rotate** (breaks one-ID-one-account) — back it up offline |
| TOTP sealing key | backend (`lib/sealed.ts`) | host secrets | owner | re-seal or reset each admin's 2FA |
| `DATABASE_URL` | backend | host secrets | owner | new DB password |
| `POSTMARK_SERVER_TOKEN` | backend | host secrets | owner | Postmark → Servers → API tokens |
| `GOOGLE_MAPS_API_KEY` | backend | host secrets | owner | Cloud console → regenerate (S0.6) |
| `GOOGLE_VISION_API_KEY` | backend | host secrets | owner | Cloud console |
| `FIREBASE_SERVICE_ACCOUNT` | backend (push) | host secrets | owner | Firebase → service accounts → new key, delete old |
| `ANTHROPIC_API_KEY` | backend (B5.4, optional) | host secrets | owner | console.anthropic.com |
| Payment provider keys | backend (B7.9) | host secrets | owner | provider dashboard |
| Android upload keystore + passwords | release builds | password manager + offline copy | owner | Play Console upload-key reset |

## Log
Newest first. Each entry: what was done, the commit, how it was checked.
- 2026-11-07: **S0.4, S0.8, S2.2 done.** S0.4: production refuses to start without an `https://` `PUBLIC_URL`.
  S0.8: `ADMIN_ORIGIN` (e.g. `https://admin.sahla.jo`) is the only origin that gets CORS headers, and only on
  `/v1/admin/*` (written in `app.ts`, no new package); the app's endpoints never send CORS headers. S2.2 (**found
  during B15**): a courier could confirm a paid order that was **not assigned to anyone** if they knew the order
  number and PIN; now only the assigned courier can (`courier/delivery.ts`). Checked by `src/lib/settings.e2e.ts`
  (production start-up with no / http / https `PUBLIC_URL`; CORS preflight from our origin, none for others or
  for app endpoints) and `courier.e2e.ts` (unassigned → 404). 143 e2e pass.
- 2026-11-07: **S0.1 + S0.2 done.** One limiter helper (`backend/src/lib/rateLimit.ts` → `perUser`, per user and
  per IP) with the budgets in one table (`LIMITS`): card payments and saving a card 5/hour per person (20 per IP),
  certificate checks 10/day, listing photos 60/hour, avatars 10/hour, chat messages 60/10 min, offers 20/hour,
  bids 60/hour, reports 20/day, new listings 20/day (only successful ones count), checkouts 30/hour, support
  messages 30/10 min. All answer `429 RATE_LIMITED` (the app already shows a message). The e2e runner multiplies
  the budgets by 50 (`RATE_LIMIT_MULTIPLIER`, refused in production); `src/lib/limits.e2e.ts` checks the real ones
  (6th card try → 429, 11th certificate → 429, 61st chat message → 429, 31st support message → 429, refused
  listings don't count). 141 e2e pass.
- 2026-11-07: plan written from an audit of `5a8e2d3`; S0 lists the findings.
