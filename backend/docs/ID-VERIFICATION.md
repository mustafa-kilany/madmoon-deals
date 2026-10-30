# ID verification (Verified badge): Sanad

**Goal:** a user taps "Verify with Sanad", approves in the **Sanad** app (Jordan's national digital
ID by the Ministry of Digital Economy and Entrepreneurship, **MoDEE**), and gets the Verified badge.
No ID photos stored by Sahla.

## What we know (October 2026)

- **Sanad has no public developer portal or self-service API.** Private companies connect through
  an agreement with MoDEE. Banks did it this way, for example AJIB with the IT company OFFTEC, where
  customers share their verified ID by scanning a QR code.
- So you can't "get an API key" online: **you apply to MoDEE.**

### How to apply

1. Register Sahla as a company in Jordan (MoDEE will ask for the commercial registration).
2. Contact MoDEE (the Sanad / digital ID team) and ask for **"Sanad digital ID integration for a
   private-sector service provider"**. Explain the use case: a marketplace verifying sellers' and
   buyers' identity, with consent, to reduce fraud.
3. Ask them for: the **integration documents**, the **test (sandbox) environment**, which **data
   fields** you can receive (aim for the *minimum*: verified yes/no, full name, and a stable ID
   reference; not the full civil record), and how **consent** works (redirect or QR).
4. Prepare a **privacy policy** that covers ID data (Jordan's Personal Data Protection Law, 2023)
   and have a lawyer check it.
5. Expect it to take weeks to months. **Don't block launch on it.**

## Until Sanad is live: manual review

The app already has `POST /me/id-verification` (an ID photo). The server saves it as an
`IdVerification` (provider `manual`, status `pending`). An admin compares it with the profile and
approves or rejects it. **Delete the photo right after the decision** (`photoUrl` set to null).

## When Sanad access arrives

The code is ready for it: `src/modules/identity/provider.ts` defines `IdVerificationProvider`, and
`sanadNotConfigured` is the placeholder to replace.

Expected flow (to be confirmed with MoDEE's documents):

```
App: "Verify with Sanad" ─► POST /me/id-verification/sanad      → { redirectUrl }
     opens Sanad (app or web), user approves
Sanad ─► redirect back to the app (deep link) with a one-time code
App ─► POST /me/id-verification/sanad/complete { code }
Server ─► exchanges the code with Sanad (server to server, with Sahla's credentials)
       ─► gets the verified identity ─► IdVerification(approved) ─► User.verified = true
```

These two endpoints are **new** and need adding to `docs/API.md` (and an app update) once MoDEE
confirms the flow.

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
