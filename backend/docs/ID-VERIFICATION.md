# ID verification (Verified badge): Sanad

**Goal:** a user taps "Verify with Sanad", approves in the **Sanad** app (Jordan's national digital
ID by the Ministry of Digital Economy and Entrepreneurship, **MoDEE**), and gets the Verified badge.
No ID photos stored by Madmoon Deals.

## What we know (October 2026)

- **Sanad has no public developer portal or self-service API.** Private companies connect through
  an agreement with MoDEE. Banks did it this way, for example AJIB with the IT company OFFTEC, where
  customers share their verified ID by scanning a QR code.
- So you can't "get an API key" online: **you apply to MoDEE.**

### How to apply

1. Register Madmoon Deals as a company in Jordan (MoDEE will ask for the commercial registration).
2. Contact MoDEE (the Sanad / digital ID team) and ask for **"Sanad digital ID integration for a
   private-sector service provider"**. Explain the use case: a marketplace verifying sellers' and
   buyers' identity, with consent, to reduce fraud.
3. Ask them for: the **integration documents**, the **test (sandbox) environment**, which **data
   fields** you can receive (aim for the *minimum*: verified yes/no, full name, and a stable ID
   reference; not the full civil record), and how **consent** works (redirect or QR).
4. Prepare a **privacy policy** that covers ID data (Jordan's Personal Data Protection Law, 2023)
   and have a lawyer check it.
5. Expect it to take weeks to months. **Don't block launch on it.**

## Until Sanad is live

Decided 2026-10-30: **Sanad only**. No ID photos and no manual review. Until MoDEE gives access, accounts
stay unverified: the app's "Verify with Sanad" button answers "coming soon" (`503 SANAD_UNAVAILABLE`).

For development and tests, `SANAD_MODE=fake` in `backend/.env` turns on a pretend Sanad that approves at
once (the server refuses it in production).

## What is already built

```
App: "Verify with Sanad" ─► POST /me/id-verification/sanad              → { redirectUrl }
     opens Sanad in the browser, the user approves
Sanad ─► GET /v1/id-verification/sanad/callback?code=…&state=…   (this server: the redirect URI)
Server ─► exchanges the code with Sanad (server to server, Madmoon Deals' credentials)
       ─► IdVerification approved, User.verified = true, badge on their listings
       ─► shows "Your account is verified. Go back to the Madmoon Deals app."
App (back in front) ─► GET /me → verified: true
```

- `state` is random, used once, valid 15 minutes; only its hash is stored (`IdVerification.stateHash`).
- The national number is never stored: `nationalIdHash` = HMAC-SHA256 with `ID_HASH_SECRET`. A second
  account with the same ID is refused ("This ID already verifies another Madmoon Deals account").
- Code: `backend/src/modules/identity/` (`provider.ts`, `sanad.ts`, `routes.ts`), tests in `identity.e2e.ts`.

## When Sanad access arrives (BACKEND_PLAN B11.2)

1. In `provider.ts`, write the `sanad` provider from MoDEE's documents: `authorizeUrl()` (their consent page
   with our client id, `state` and callback URL) and `exchange()` (code → national number + their reference).
   Put their client id / secret and URLs in `.env`, and add `live` to `SANAD_MODE`.
2. Register `https://api.sahla.jo/v1/id-verification/sanad/callback` with MoDEE as the redirect URI.
3. Set `ID_HASH_SECRET` (`npm run secret`) once, and never change it.
4. The app and `docs/API.md` need no change, unless MoDEE's flow differs (e.g. QR codes).

## Rules for ID data

- **Never store the national number.** Store `nationalIdHash` = HMAC-SHA256(national number, a
  server secret). It still lets you enforce **one ID → one verified account** and spot a banned person
  coming back.
- Store only what's needed: approved yes/no, when, the provider's reference, and maybe the Arabic name
  for matching the profile.
- Log every verification (who, when, the result) for audits.

## Ideas

- Show **"Verified with Sanad"** on profiles and listings: buyers trust it more than a generic badge.
- Require Sanad verification for **high-value listings** (e.g. cars, or anything over 1000 JOD) and for
  **payouts** to sellers.
- Verified accounts start with **lower risk scores** ([ACCOUNT-RISK.md](ACCOUNT-RISK.md)).
