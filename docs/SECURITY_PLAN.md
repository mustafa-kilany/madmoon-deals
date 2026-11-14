# Madmoon Deals Security Plan

How Madmoon Deals' security gets checked before launch and kept checked after it. Written 2026-11-07 from an
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
| S0.3 | 🔨 code ✅, key ⏸ owner | **Android release is signed with the debug keystore** (`frontend/android/app/build.gradle`, `release { signingConfig signingConfigs.debug }`). Anyone has that key. | Make an upload keystore, keep it and its passwords **outside git** (password manager + an offline copy), sign release with it, turn on **Play App Signing**, add its SHA-1/256 to Firebase (Google sign-in breaks without it). | `keytool -list -printcert -jarfile app-release.aab` shows our certificate, not "Android Debug". |
| S0.4 | ✅ | **`PUBLIC_URL` is optional in production**: file URLs are then built from the request's `Host` header (`backend/src/lib/publicUrl.ts`), so a forged header puts an attacker's domain into photo URLs that get cached. | `env.ts`: refuse to start in production without `PUBLIC_URL` (same style as the other `.refine` rules). | Start with `NODE_ENV=production` and no `PUBLIC_URL` → refuses. |
| S0.5 | 🔨 code ✅, bucket ⏸ | **Photos are on the API server's disk** (`lib/storage.ts`, D1 not built). On Railway/Render-style hosting the disk is wiped on deploy, and private certificate originals sit next to the app. | Build the R2/S3 storage behind the same interface: a **public** bucket for listing photos (random names), a **private** bucket for certificate originals (dashboard reads via short-lived signed URLs or the existing proxy). | Upload, redeploy, photo still there; a certificate original's URL without a signature → 403. |
| S0.6 | 🔴 | **Google Maps key was pasted in a chat** (2026-11-02). | Regenerate it in Google Cloud, restrict it to the Geocoding API (+ the server's outgoing IP once hosted), set a daily quota and a budget alert. | Old key → `REQUEST_DENIED`; Cloud console shows the restrictions. |
| S0.7 | 🟠 | **Firebase API key is in git** (`frontend/android/app/google-services.json`). This is normal for Firebase (it is a client id, not a secret) **only if** it is restricted. | In Google Cloud → Credentials: restrict that key to Android apps (`package name` + release SHA-1) and to the Firebase APIs it needs. Check whether the GitHub repo is private. | Key's page shows "Android apps" restriction. |
| S0.8 | ✅ | **No CORS rule yet**, needed when the dashboard moves to `admin.sahla.jo` (B8.6). The risk is the opposite fix: `origin: *`. | Allow exactly `https://admin.sahla.jo` (and `http://localhost:5174` only outside production), on `/v1/admin/*` only. The phone app needs no CORS. | `curl -H "Origin: https://evil.example" …/v1/admin/me -I` → no `Access-Control-Allow-Origin`. |
| S0.9 | ✅ | **Rate limits are kept in memory**: they reset on restart and don't add up across 2+ servers. | Fine with one server. With 2+ (B12), use a shared store (PostgreSQL table or Redis) for `express-rate-limit`. Done 2026-11-10: every budget in the `RateLimit` table (`lib/rateLimit.ts` `SharedStore`); only the flood fence stays per server. | `sharedLimits.e2e.ts`: 5 card tries split across two servers, the 6th refused. |
| S0.10 | 🔨 API ✅, app + dashboard + project ⏸ | **No error tracking or alerts** (Sentry pending, B12.1/B12.4). Attacks show up as error spikes nobody sees. | Sentry on backend + app + dashboard (scrub tokens, passwords, PINs, card data, coordinates); uptime check; alert on 5xx rate and on 401/429 spikes. | A thrown test error appears in Sentry with no secrets in it. |
| S0.11 | ⏸ owner | **The Apple button on Android sends no token** (`AuthScreen.tsx` → `logInApple.mutate(undefined)`): it always fails. Not a hole, but a broken auth path is where people add quick hacks. | ~~Hide the button~~ **Owner's decision 2026-11-07: keep it; Apple sign-in is finished before production** (Apple Developer account; on Android it needs Sign in with Apple JS / a Services ID). | Apple sign-in works on each platform where the button shows. |

---

## S1 — Accounts, log-in and sessions (backend)

Already in place: ✅ scrypt passwords · ✅ HS256 JWT **plus a database session per token** (log-out, reset,
delete and suspend revoke at once) · ✅ HMAC'd email codes · ✅ rate limit per IP + email on auth → 429 ·
✅ `DEV_EMAIL_CODE` refused in production · ✅ staff domain refused at public sign-up · ✅ Google/Apple ID
tokens checked against the providers' keys and our client ids; JWKS URLs locked in production · ✅ suspended
users get 403 · ✅ app tokens can't open `/admin`, dashboard tokens open nothing else.

| # | Check | How |
|---|---|---|
| ✅ S1.1 | `JWT_SECRET` in production is new, random (≥ 32 bytes), only in the host's secret settings, different from development. | `npm run secret`; never in `.env` committed; compare to dev = different. |
| ✅ S1.2 | Password rules: minimum length ≥ 8 (prefer 10), max length capped (e.g. 128, scrypt cost), common-password list refused. | Read `password.ts` + sign-up schema; e2e with `password123`. |
| ✅ S1.3 | No account enumeration: sign-up, log-in, forgot-password give the same answer and similar timing for "no such email". | Call each with a known and an unknown email; compare body and time. |
| ✅ S1.4 | Email codes: 6 digits, expire (≤ 10 min), one use, ≤ 5 wrong tries then a new code needed. | Read `codes.ts`; e2e: 6th wrong try refused even with the right code. |
| ✅ S1.5 | Reset password signs out every other session; changing the email (if allowed) needs the code to the new address. | e2e: two sessions, reset, the old token → 401. |
| ✅ S1.6 | Session length: **owner's decision 2026-11-07: stays 60 days.** Admin 12 h. Log-out, reset, delete and suspend end a session at once. | Decision noted. |
| ✅ S1.7 | `alg` is pinned to HS256 when verifying (no `none`, no RS/HS confusion). | Read `tokens.ts` (`jwtVerify(…, { algorithms: ['HS256'] })`); unit test with an `alg: none` token. |
| ✅ S1.8 | Google sign-in links to an existing account **only when Google says the email is verified** (`email_verified`). | Read `social.ts`; unit test with `email_verified: false`. |
| ✅ S1.9 | Account deletion really deletes or anonymises personal data (keeping only what law/accounting needs). | Delete a test account, look at every table for its email/name/phone. |

## S2 — Who can see and change what (authorization / IDOR)

The #1 API risk. Every id in a URL or body must be checked against the caller.

Already in place: ✅ `requireUser` / `requireCustomer` / `requireCourier` / `requireAdmin` · ✅
`staffOnly.e2e.ts` checks every customer endpoint refuses couriers · ✅ order lookups pass the caller's id
(`getOrder(userId, id)`), chats too (`listMessages(userId, …)`) · ✅ pickup address never in listing responses
· ✅ the PIN is never shown in the dashboard.

| # | Check | How |
|---|---|---|
| ✅ S2.1 | **Two-user test for every endpoint with an id**: user B tries user A's order, chat, messages, offer, listing edit/delete, certificate, upload, device token, blocked list. All → 404 (or 403). | One e2e file `authz.e2e.ts` looping a table of endpoints (like `staffOnly.e2e.ts`). Add each new endpoint to it. |
| ✅ S2.2 | A courier only sees **their own** assigned deliveries; can't mark picked-up / confirm another courier's order. | e2e with two couriers. |
| ✅ S2.3 | A seller sees the buyer's delivery details **only** after payment, and a courier only while assigned. | e2e: before pay → no address; after delivery → decide if it should disappear. |
| ✅ S2.4 | Mass assignment: `PATCH /me` and `PATCH /listings/:id` ignore `role`, `verified`, `suspended`, `status`, `sellerUserId`, prices of others… (zod `.strict()` or picked fields). | e2e: send `{"role":"admin"}` → no change. |
| ✅ S2.5 | Store API keys (refurbished import) only touch **their own store**; revoked keys → 401. | e2e with two stores. |
| ✅ S2.6 | Responses don't leak fields: no `passwordHash`, `cardToken`, `pin`, `nationalIdHash`, `pickupPhone`, other users' emails in any JSON. | Grep the `toApi*` shape functions; e2e snapshot of each response's keys. |

## S3 — Money: orders, escrow, payments, payouts

Already in place: ✅ the server prices every order (client prices ignored) · ✅ row locks so one payment wins,
late payments refunded · ✅ the bank callback **asks the provider** for the status (doesn't trust the URL) ·
✅ fake provider refused in production · ✅ PIN locks after 5 wrong tries (counted before compare) · ✅
refunds admin-only and logged · ✅ cards tokenised by the provider (`User.cardToken`), no card numbers stored.

| # | Check | How |
|---|---|---|
| ✅ S3.1 | Card-testing limit (= S0.1). | See S0.1. |
| 🔨 S3.2 | **Card numbers never reach our server.** With the real provider (D2) use its hosted page or SDK card field, so we stay in PCI **SAQ A**. Today the app has a typed card field → `tokenizeCard`; check where that number goes. | Read `frontend/src/services/payments`; with D2, network capture: no PAN in any request to `api.sahla.jo`. |
| ⬜ S3.3 | The real provider's callback / webhook is **signed** and the signature is checked; amounts and currency compared to the order. | Code review at B7.9; e2e with a forged callback → ignored. |
| ✅ S3.4 | Idempotency: pay twice, refund twice, mark payout sent twice, confirm delivery twice → one effect. | e2e double calls in parallel (`Promise.all`). |
| ✅ S3.5 | Amounts in integer fils everywhere; no negative or zero prices, offers or bids; max price cap. | zod schemas; e2e with `-1`, `0`, `1e15`. |
| ✅ S3.6 | The PIN: 4 digits = 10 000 options; 5 tries before lock ✅. Check it's random (`crypto.randomInt`), not logged, only shown to the buyer. | Read `pay.ts`; grep logs for the PIN. |
| ✅ S3.7 | Payout bank details: who can change them, and does a change need re-login / a code? A changed IBAN before payout is the classic fraud. | Design decision when payouts are built for real. |
| 🔨 S3.8 | Money reconciliation once a day: provider's settled total = our `Payment` succeeded − refunds. Alert on a difference. | Script/job at B7.9. |

## S4 — Uploads and files

Already in place: ✅ file type from the bytes, EXIF (GPS) stripped, re-encoded with `sharp` · ✅ random names ·
✅ listings accept only the caller's own unused uploads · ✅ certificate originals private, IMEI/serial blurred
for buyers · ✅ private paths can't leave their folder · ✅ JSON body limit 64 kb (5 MB for imports).

| # | Check | How |
|---|---|---|
| 🔨 S4.1 | Cloud storage with a private bucket (= S0.5). | See S0.5. |
| ✅ S4.2 | Upload size limit and pixel limit (decompression bomb: a tiny PNG that expands to 50 000 × 50 000). `sharp({ limitInputPixels })`. | Upload a bomb image → 4xx, server memory stays flat. |
| ✅ S4.3 | SVG, HTML, PDF uploads refused (only JPEG/PNG/WebP/HEIC). | e2e upload of an `.svg` renamed `.jpg` → refused. |
| ✅ S4.4 | Photos served with `X-Content-Type-Options: nosniff` and the right `Content-Type` (from the CDN too). | `curl -I` a photo URL. |
| ✅ S4.5 | CSV import: formula injection (`=HYPERLINK(…)` in a cell) can't reach an admin's Excel when exported; 1000-row cap ✅. | Import a row starting with `=`; check it's stored/escaped. |

## S5 — Dashboard (admin) and staff

Already in place: ✅ password → 5-minute ticket → TOTP code (secret AES-GCM encrypted, each code once) ·
✅ 12 h tokens, `scope: admin` · ✅ production refuses `ADMIN_2FA=off` · ✅ audit log with IP · ✅ token in
`sessionStorage` (gone when the browser closes) · ✅ limits on both log-in steps.

| # | Check | How |
|---|---|---|
| ⬜ S5.1 | **Turn 2FA back on** before hosting (remove `ADMIN_2FA=off`), each admin scans a new QR. | Production start refuses `off` ✅; log in once to confirm. |
| ✅ S5.2 | Change the seeded `admin@sahla.jo / sahla1234`: **the seed must never run in production**. Create real admins with `npm run staff`. | `db:seed` refuses when `NODE_ENV=production`; no `sahla1234` account in production. |
| ⬜ S5.3 | Dashboard hosting headers: strict **Content-Security-Policy** (no inline scripts), `frame-ancestors 'none'`, HSTS, `Referrer-Policy: no-referrer`. A CSP is what protects the `sessionStorage` token from XSS. | securityheaders.com on `admin.sahla.jo` → A. |
| ✅ S5.4 | XSS: user text (listing titles, chat, report reasons, names) shown in the dashboard is escaped (React does this; check no `dangerouslySetInnerHTML`). | `grep -r dangerouslySetInnerHTML admin/src`; create a listing titled `<img src=x onerror=alert(1)>` and open it in the dashboard. |
| ⬜ S5.5 | Optional: allow `/v1/admin/*` only from the office IP or a VPN / Cloudflare Access. Decide at B12. | Decision note. |
| ✅ S5.6 | Least privilege (built: B15.7 admin types): decide if all admins need refunds + payouts, or split roles (support vs finance). | Decision note; roles later if needed. |
| ⬜ S5.7 | Staff leaving: disable courier/admin account → their sessions die at once. | e2e: disable → old token 401/403 ✅ check. |
| ⬜ S5.8 | `reset-2fa` and `staff` commands run only on the server by the owner; nobody else has production shell/DB access. | Host access list. |

## S6 — Mobile app (Android now, iOS later) — OWASP MASVS

Already in place: ✅ token in the device keychain (`react-native-keychain`) · ✅ `allowBackup="false"` · ✅
cleartext HTTP only in debug builds · ✅ R8 shrinking in release · ✅ only area-level location sent, no
coordinates stored.

| # | Check | How |
|---|---|---|
| 🔴 S6.1 | Release keystore + Play App Signing (= S0.3). | See S0.3. |
| ✅ S6.2 | Release build talks only to `https://api.sahla.jo` (no `10.0.2.2`, no contract server, no `mock: true` services). | Decompile the release APK (`jadx`) and search `10.0.2.2`, `mock`; check `config.ts` at build time. |
| ✅ S6.3 | No secrets in the app bundle: only public ids (Google web client id, Firebase config). No Maps/Vision/Postmark keys. | `jadx` + grep `AIza`, `sk-`, `postmark` in the APK; only the restricted Firebase key should appear. |
| ✅ S6.4 | Logs: no tokens, PINs, emails or card digits in `console.log` in release (strip with babel `transform-remove-console`). | `adb logcat` while signing in / paying on a release build. |
| ✅ S6.5 | The delivery PIN and card screens hide from screenshots / the app switcher (`FLAG_SECURE` on those screens). | Take a screenshot on the PIN screen → blocked. |
| ✅ S6.6 | Push notifications don't carry private data (no PIN, no address) in the visible text. | Read `notify.ts` texts. |
| ✅ S6.7 | Deep links / push taps can't open another user's order (the server check in S2 is what matters). | Tap a crafted `order` push with someone else's id → "not found". |
| ⬜ S6.8 | Optional later: certificate pinning, root/jailbreak detection, Play Integrity on sign-up and payment. Decide after launch based on fraud seen. | Decision note. |
| ✅ S6.9 | Permissions: only camera, photos, coarse+fine location (checkout), notifications. Nothing unused in the manifest. | Read the merged release manifest. |

## S7 — Server, database, hosting, secrets

Already in place: ✅ `helmet` headers · ✅ `x-powered-by` off · ✅ `TRUST_PROXY` setting · ✅ `pino` logs
without query strings, headers or bodies · ✅ `.env` refuses dangerous production settings · ✅ Prisma
(parameterised queries).

| # | Check | How |
|---|---|---|
| ⬜ S7.1 | HTTPS only (`api.sahla.jo`, `admin.sahla.jo`), HSTS, TLS 1.2+. | ssllabs.com → A. |
| ⬜ S7.2 | Database not reachable from the internet (private network / IP allow list), its own strong password, TLS, the app's DB user is not a superuser. | `psql` from home → refused. |
| ✅ S7.3 | Every secret only in the host's secret store: `JWT_SECRET`, `ID_HASH_SECRET`, `DATABASE_URL`, Postmark, Maps, Vision, Firebase service account, Anthropic, payment keys, the TOTP sealing key. Listed with who can see it and how to rotate it. | Table at the end of this file; `git log -p` + `gitleaks detect` → nothing. |
| ✅ S7.4 | Raw SQL (`$queryRaw`) only with tagged templates, never string-built (`$queryRawUnsafe`). | `grep -rn "queryRawUnsafe\|executeRawUnsafe" backend/src` → none, or each reviewed. |
| ✅ S7.5 | Outgoing calls (geocoder, Google, Firebase, Vision) have timeouts and never fetch a URL a user typed (SSRF). | Read each `fetch(`; grep for user-controlled URLs. |
| ✅ S7.6 | Error answers in production show no stack traces or SQL. | Force a 500 in staging; body is the standard error only. |
| 🔨 S7.7 | Backups (tools and drill ✅, the host's schedule ⏸): daily, encrypted, kept 30 days, **a restore tested** (B12.3). | Restore into a fresh DB and run the e2e smoke. |
| 🔨 S7.8 | Logs kept (contents ✅, the 90 days is a host setting ⏸) e.g. 30–90 days; contain no personal data beyond IP/user id (S0.10 scrubbing). | Read a day of production logs. |
| 🟠 S7.9 | Dependencies: `npm audit` clean (or each finding noted), Dependabot / Renovate on, lockfiles committed, no `latest` versions. **2026-11-07:** backend 0, admin 0, frontend 13 (8 high): `@grpc/grpc-js` / `firebase` JS SDK pulled in by `@react-native-firebase` (Node/web code, not the Android native path; npm's "fix" is a downgrade to v20, don't), `body-parser`, `joi`, `postcss-selector-parser`, `deepmerge` (Metro / RN CLI build tools, not in the app). Re-check when `@react-native-firebase` updates. | `npm audit --omit=dev` in backend, frontend, admin. |
| 🔨 S7.10 | CI checks (written, first run needs a push): add `gitleaks` (secrets), `npm audit --audit-level=high`, and CodeQL (free on GitHub) to `.github/workflows`. **First run 2026-11-12 (pull request #1): gitleaks and npm audit run. CodeQL is paused (hand start only, the owner chose): the repository is private, and GitHub scans private code only with its paid Code Security add-on; turn it back on when bought.** | A PR with a fake key fails CI. |

## S8 — Privacy, ID data and legal

| # | Check | How |
|---|---|---|
| ✅ S8.1 | Privacy policy + terms in the app and on the site, accepted at sign-up (stored with date/version). | Sign up → acceptance row exists. |
| ✅ S8.2 | Sanad: the **consent screen and stored consent record** before every lookup (MoDEE's pledge: 500 JOD per lookup without consent). Only the fields we asked for. National number only as a keyed hash ✅. | e2e: verification without a consent record → refused. |
| ✅ S8.3 | Data retention: chats, delivery addresses on completed orders, certificate originals, logs, deleted accounts: how long each is kept, and a job that deletes it. | Table in the privacy policy + cleanup jobs. |
| ✅ S8.4 | A way for users to export/delete their data (delete ✅ `DELETE /me`). | Doc + test. |
| ✅ S8.5 | A breach plan: who to call, how to revoke all sessions (`JWT_SECRET` rotation signs everyone out), how to tell users. | One page, below. |

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

## Breach plan (S8.5)

If you think data or a secret leaked. Do these in order; note the time of each step.

1. **Stop the leak.** Which secret? A key in a chat or in git: rotate it now (table below). A server: take it off the network, keep it for study; don't delete logs.
2. **Sign everyone out if accounts or `JWT_SECRET` may be affected.** Set a new `JWT_SECRET` (`npm run secret`) and restart: every session ends at once and
   admins set up their authenticator again. **Never change `ID_HASH_SECRET`** unless it leaked; if it did, see its row below first.
3. **Protect the money.** Tell whoever sends payouts to stop until the money check passes: `npm run money:check`. Read the audit log (`/admin/actions`) for refunds,
   payouts and changed admins. Look at bank accounts changed recently: each one held payouts for 24 hours.
4. **See what happened.** Host logs (kept 90 days), error reports, `AdminAction`, the newest backup from before the event (keep it, don't overwrite it).
5. **Tell people.** Jordan's Personal Data Protection Law No. 24 of 2023: the owner, with the lawyer, tells the regulator and the affected people what the law requires, within
   the time it requires. Say plainly what leaked, what you did, and what they should do (change their password; watch for scam messages). Have the lawyer confirm the wording and the deadline **before launch**.
6. **Tell the partners that need it:** the payment provider (card-related), MoDEE (anything touching Sanad), Google/Firebase (their keys).
7. **Afterwards:** what let it happen, a test that would have caught it, a line in the Log below.

Who: the owner decides; [ask the owner: a second person who can act if the owner can't be reached, and the lawyer's number].

## Secrets register (fill in as they are created)

| Secret | Used by | Stored in | Who can see | How to rotate |
|---|---|---|---|---|
| `JWT_SECRET` | backend | host secrets | owner | change → everyone signs in again |
| `ID_HASH_SECRET` | backend (Sanad IDs, certificate serial numbers, sellers' IBANs) | host secrets + an offline copy | owner | **never rotate** (breaks one-ID-one-account, and sellers' IBANs can't be read: they must enter them again). Production refuses to start without it. |
| Admins' 2FA secrets | backend (`lib/sealed.ts`, key derived from `JWT_SECRET`) | database (encrypted) | nobody | changing `JWT_SECRET` makes each admin scan a new QR code |
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
- 2026-11-10: **S0.9 rate limits shared by every server.** Every budget (cards, payments, sign-in and codes, dashboard sign-in, uploads, chats, bids, offers, reports, geocoding) is counted in the `RateLimit` table, so two servers can't double them; the flood fence alone stays per server. Keys are stored only as a hash: the first version kept emails and user ids, and S1.9's test caught them left behind after an account deletion. `sharedLimits.e2e.ts` (5 card tries split across two servers, the 6th refused; the per-address fence; refused tries given back), 2 more cases in `check:mutations`; both tests fail on the old code. Daily jobs now run on one server (`jobs.e2e.ts`). Two servers behind a balancer: `npm run balancer-test`, 12 of 12 twice (`INTERNAL_READINESS_PLAN.md`).
- 2026-11-09: **Live chat (`GET /v1/me/live`).** A signed-in connection that only says what changed (a chat's id), never the content: messages are still fetched through the normal endpoints and their checks, and never pass through database notifications. The token goes in a header, never the address; admin tokens don't open it; a session that ended (log-out, password reset, deletion, suspension, expiry) closes its connection within 25 seconds; 5 connections a person. Read markers (`POST /chats/:id/read`) are private: only that person's phones hear of them. `liveChat.e2e.ts`, 18 more cases in `check:mutations`. Not yet run on a real phone or through a real load balancer.
- 2026-11-08: **Live auction connection (`GET /v1/listings/:id/live`).** A new way into the server that skips Express, so it has its own protection: only public data (the same as `GET /listings/:id/bids`, checked by a test), no log-in and nothing can be sent (64-byte limit, any message closes it), real auctions only, foreign browser origins refused, limits per address, in total and per minute, following `TRUST_PROXY`; compression off; phones that stop reading or answering are dropped; a database link that dies or silently stops delivering is noticed. `live.e2e.ts`, 13 more cases in `check:mutations`. Not covered yet: `check:attack` only walks Express routes, and the connection hasn't run on a real phone or through a real load balancer.
- 2026-11-08: **Proof runs.** `npm run check:mutations`: 39 protections broken one at a time, all caught; the first pass found two test gaps, now closed: nothing checked that an **admin's app token** can't skip the dashboard's second step (the code was right), and the card-number test passed thanks to the fake provider rather than our guard. `npm run check:apk` on the built release: **found the demo password hint, demo accounts and mock services in the bundle** (unused, but shipped), removed. The merged manifest adds only normal-level permissions from libraries (`USE_BIOMETRIC` and `USE_FINGERPRINT` from the keychain library, unused; `WAKE_LOCK`, `ACCESS_NETWORK_STATE`, push). Results and what's still unproven: `INTERNAL_READINESS_PLAN.md`. **Not done: S9's ZAP and MobSF scans (outside programs), and the emulator and dashboard runs listed there.**
- 2026-11-08: **The app (`INTERNAL_READINESS_PLAN.md` phase 4).** **S6.5 checked on the emulator:** `adb screencap` on the bank account screen gives a completely black image while the screen keeps working
  (`ScreenSecurityModule.kt`; also the order with its PIN, the driver's PIN screen, checkout, and the profile's card field while typing). **S6.4:** release builds strip `console.*`. **S6.2, S6.3, S6.9 + accessibility:** `__tests__/appSecurity.test.ts` reads the source and manifest: release uses only `https://api.sahla.jo/v1`, no service on mock data, no secret key, only 4 permissions in our manifest, all 81 tappable elements are buttons to a screen reader and icon-only ones have labels.
  **Still to check on a built release APK:** the merged manifest (libraries add permissions), and the bundle's contents. **S6.6:** push texts read: no PIN, address or chat text. **S6.7:** a push only opens a screen; the server's checks decide (S2.1). **Found while testing:** an auction winner had no way to find a win without the push: `GET /me/auctions-won`, shown on the Auctions tab and Profile.
- 2026-11-08: **Server and files (`INTERNAL_READINESS_PLAN.md` phase 3).**
  * **Found by the new load test, the worst bug of this work:** `placeBid` asked for a second database connection while its transaction held one. **120 bids at once: all 120 answered 500, and the whole
    server stalled for 5 seconds**, for people only browsing too. Any busy auction would have taken Madmoon Deals down. Fixed in `negotiation/bids.ts`; `bidsLoad.e2e.ts` proves it (it failed 120/120 on the old code). The
    load test went from 83 to 393 requests a second, p95 under 500 ms. It was the only place with this mistake (searched every `$transaction`). `DB_POOL_SIZE` is now a setting.
  * **S0.5 built:** `lib/storage.ts` speaks S3 (R2, S3, MinIO) with a public and a private bucket; production refuses `local`. `storage.e2e.ts` runs the whole flow against a small S3 server that **recomputes AWS's Signature V4
    itself** and refuses a wrong one. **Not yet run against a real bucket** (downloading MinIO was refused by this PC's permissions): `npm run check:storage` does it, in the R2 steps of `backend/docs/STORAGE.md`.
  * **S7.6, S7.8, S0.10:** Prisma's error messages quote the query's values: a real password hash was seen in one. `lib/scrub.ts` keeps only the kind of database error; emails, phones, card numbers, IBANs, tokens and keys are
    removed from all others; push tokens are out of logged paths. Error reports: `lib/errorReporter.ts` (no SDK, so we decide what leaves: the scrubbed error and the route's pattern only), tested on a stand-in Sentry; off until there is a DSN. **The app and dashboard have no error reports yet** (needs the Sentry project + a native SDK).
  * **S7.5:** every outgoing call has a timeout (read each `fetch`); none takes a URL a user typed. The Vision key moved from the URL to a header.
  * **F3:** an overall limit per address; a NUL byte or broken address is a 4xx. **S4.5:** imported cells can't start like a formula. **S4.4:** `nosniff` on API files (checked by the attack script) and sent to storage; on `files.sahla.jo` it needs the Cloudflare rule in `STORAGE.md`.
  * **G4, the attack script (`npm run check:attack`):** a real server in production mode; checks headers, that fake and dev routes are gone, traversal, 6 kinds of forged token, CORS, 10 injections on 15 filters (with timing), floods, huge and deep bodies, prototype pollution, mass assignment, then **8 408 junk requests across all 118 routes as nobody, customer, courier and admin** (108 routes reached their code; only 8 stopped by a limit, so the fuzzing was real).
    First run: **1 problem**, a deep-JSON stack overflow in my own new NUL check, fixed. Now: **17 511 checks, 0 problems**.
  * **S7.3, S7.10:** `npm run check:secrets` over all 97 commits and 554 files: **none found** (the Maps key from the 2026-11-02 chat never reached git). The script checks its own patterns first. CI gets gitleaks, `npm audit`, CodeQL and Dependabot: **these run only once the branch is on GitHub, so they haven't run yet.**
  * **B12.2:** `backend/Dockerfile` + `docs/DEPLOY.md`, clean shutdown. **Docker isn't on this PC, so the image hasn't been built here:** every Dockerfile step was run by hand in an empty folder (`npm ci --omit=dev`, `migrate deploy`, production start with no `.env`, 10 endpoints right); CI builds the real image. The SIGTERM test runs on Linux only, so **CI will be its first run**.
  * **B12.3 / S7.7:** `npm run db:backup`, `db:restore` (refuses a database with tables), `db:restore-test`. The drill passed on the dev database: encrypted file, wrong key refused, **28 tables, 247 rows identical**. It reported 5 listing mismatches in the dev data: `db:seed` puts demo listings back on sale under old orders. That is the seed only (the import refuses paid and sold rows; no production path does this).
  * **S1.1:** a blank line in the host's settings no longer stops the server. **S5.2:** the seed refuses production, tested.
- 2026-11-08: **Accounts and privacy (`INTERNAL_READINESS_PLAN.md` phase 2).**
  * **S1.3 enumeration fixed:** `send-otp` and `signup` said `EMAIL_TAKEN` to anyone, and `forgot-password` took longer for real accounts (it waited for the email), and log-in was
    faster for Google accounts (no scrypt). Now the same answers and timing; the mailbox's owner gets "you already have an account". `auth/privacy.e2e.ts`.
  * **S1.9 deletion fixed (the biggest privacy gap):** it left pickup and delivery phones and addresses on orders and listings, chats on the person's listings, reports about them,
    every **photo file and certificate original on disk**, and the saved card at the provider, while the policy promised they were gone. It also let a person leave with money still owed,
    or as the top bidder, and let a driver or the only owner delete themselves. Now tested by planting marks in every table, deleting, and searching **every table** and the disk.
    Accepted: the admin audit log keeps the person's id (who at Madmoon Deals did what). Known limit: a rejected fake certificate's hash goes with the account, so someone could delete and retry.
  * **S2.1 + a route walker:** `lib/authz.e2e.ts` reads the server's route table: every non-public route must answer 401 with no token, every admin route must refuse customers and
    couriers, and a customer route with an id not in the two-user table **fails the test**. No hole found: all passed.
  * **S2.3 tightened:** a delivered or failed job keeps only names and areas on the driver's phone. **S2.5** passed (two stores, revoked key). **S2.6:** `lib/leaks.e2e.ts` walks real answers from guests,
    customers, couriers and admins for 14 secret field names, plus emails and pickup details: none found.
  * **S1.1:** production refuses a guessable `JWT_SECRET` and a missing or identical `ID_HASH_SECRET`. **S1.5:** tested with two sessions and a phone. **A2:** new limits per email (one account from many
    addresses) and per address (one address on many accounts), tested in `limits.e2e.ts` with 300 real addresses and emails.
  * **S8.3:** `privacy/retention.ts` + nightly job; the numbers are in the policy (**for the lawyer to confirm**). **S8.4:** `GET /me/export`. **S8.5:** the plan above. LEGAL_VERSION is now `2026-11-08`.
- 2026-11-08: **Money (`INTERNAL_READINESS_PLAN.md` phase 1).** Every test below was first run on the old code. Four were **real bugs**:
  * **The delivery PIN was in three admin answers** (assign, unlock PIN, retry a problem): an admin plus a courier could have
    released the money with no buyer. "Never shown in the dashboard" was true of the page, not the API. Fixed in `orders/admin.ts`.
  * **S3.4: three refunds at once all reached the bank**, and a refund racing the courier's PIN could end with the money
    back *and* a payout. `giveMoneyBack` now holds the order's row lock around the provider call; refund, cancel and
    confirm-delivery all pass through it. When adding the real provider (B7.9) pass it an idempotency key as well.
  * **A PIN could complete a delivery the driver never picked up.** Now 422, and an early try uses none of the 5.
  * **An auction whose winner never paid was stuck forever** (the seller could not withdraw it). Now withdrawable after 48 hours.
  * Already right, now tested: S3.5 every money field refuses `-1, 0, 1.5, 1e15, "100", null`; S3.6 the PIN is `randomInt` and only
    the buyer gets it; paying twice, two buyers on one listing, confirming twice, a payout marked twice all have one effect.
  * **S3.2:** the app's `tokenizeCard` sends only a token (read `services/payments`), and now the server also refuses anything
    shaped like a card number, without repeating it. The app's plain card field is still a mock: **it must become the provider's
    SDK field at D2**, that part stays open.
  * **S3.7 built (a gap, not a bug):** sellers had **nowhere to give a bank account**. `PUT /me/payout-account`: password or emailed code
    each time, IBAN validated and encrypted (key from `ID_HASH_SECRET`, survives a JWT rotation), push + email, 24-hour hold after a
    change, finance sees the IBAN and support doesn't, the audit log records which account was paid.
  * **S3.8 built, our half:** `npm run money:check` + a daily job compare our own records (8 rules). Comparing with the provider's
    report waits for D2.
  * Checked by `orders/money.e2e.ts` (9) and `payouts/payouts.e2e.ts` (6). 161 e2e pass.
- 2026-11-07: **Code checks S1.2, S1.4, S1.7, S1.8, S2.4, S4.2, S4.3, S5.4, S7.4.**
  * S1.7 ✅ already: `jwtVerify` pins `algorithms: ['HS256']`, issuer and audience (`auth/tokens.ts`).
  * S1.8 ✅ already: Google / Apple link an existing account only when the token says `email_verified` (`auth/social.ts`), tested in `social.e2e.ts`.
  * S1.4 ✅ already: codes valid 10 minutes, 5 tries counted before comparing (`auth/codes.ts`).
  * S2.4 ✅ already: `PATCH /me` takes only name and city (zod drops the rest); `PATCH /listings/:id` is `.strict()` (a `brand` → 422, `selling.e2e.ts`).
  * S5.4 ✅: no `dangerouslySetInnerHTML` in the dashboard or the app (grep).
  * S7.4 ✅: no `$queryRawUnsafe` / `$executeRawUnsafe`; raw SQL only as tagged templates (grep).
  * **S1.2 fixed:** 8–200 characters plus a refused list of the most common passwords (`frontend/src/lib/commonPasswords.ts`,
    shared: the app's sign-up form says why, the server refuses). Log-in is unchanged, so existing demo accounts still work.
  * **S4.2 fixed:** an image's header may claim at most 40 million pixels (`uploads/images.ts`), before any decoding;
    sharp itself refuses above 268 MP. **S4.3** ✅: the type comes from the bytes (an SVG named `.jpg` → 422).
  * Checked by `src/lib/hardening.e2e.ts` (4 common passwords → 422; a 64 MP PNG header of 1.3 KB → 422 "too many
    pixels"; an SVG named `.jpg` → 422). 146 e2e + 201 app tests pass.
- 2026-11-07: **S0.3 prepared.** `frontend/android/app/build.gradle` signs release builds with Madmoon Deals' upload key
  when `MADMOON_UPLOAD_*` is set in `%USERPROFILE%/.gradle/gradle.properties` (outside git); without it a release
  build for the emulator still uses the debug key, but `bundleRelease` (the Play Store file) **refuses** to run.
  Steps for the owner (make the key, store it, Play App Signing, Firebase SHA-1): `docs/RELEASE_SIGNING.md`.
  Checked: `gradlew :app:tasks` configures. **Open (owner):** create the key (a password only the owner knows).
  **S0.11** changed by the owner: the Apple button stays; Apple sign-in must work before production.
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
