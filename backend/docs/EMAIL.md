# Emails: Postmark

Madmoon Deals sends one kind of email: **6-digit codes** for sign-up, password reset and staff (courier / admin)
invites, in Arabic and English (BACKEND_PLAN B9.1, decision D3 = **Postmark**: built for exactly these
emails, fast and good at reaching the inbox).

Code: `src/modules/auth/mailer.ts` (`postmarkMailer`, `codeEmail`), used by `src/modules/auth/codes.ts`.
Settings in `backend/.env`:

```
MAIL_MODE=postmark                     # console = printed in the terminal (development)
POSTMARK_SERVER_TOKEN=...              # a secret: never commit it
MAIL_FROM=Madmoon Deals <no-reply@sahla.jo>    # an address at the domain verified in Postmark
```

* `DEV_EMAIL_CODE` (e.g. `123456`) **skips sending entirely**: remove it to send real emails.
* The server refuses to start with `MAIL_MODE=postmark` and no token, and with `MAIL_MODE=console` in production.
* `npm run test:api` never sends real emails, whatever `.env` says.
* Postmark down, wrong token, or account not approved yet → the app shows "We couldn't send the code right
  now" (`503 EMAIL_UNAVAILABLE`), the unsent code is forgotten so the user can ask again at once, and the
  backend log says why (never the code).
* An address that can't get email (invalid, or it bounced before): nothing is sent and nothing is shown, the
  same as for an email with no account, so nobody can find out which emails have accounts.

## Cost

100 emails a month free; then about 15 USD a month for 10 000 (check <https://postmarkapp.com/pricing>).

## Setting it up

You need **your own domain first** (e.g. `sahla.jo`): Postmark doesn't send from Gmail or other free
addresses. A `.jo` domain is registered through a Jordanian registrar and needs company papers;
`sahla.com.jo` or a `.com` are alternatives. Buy it where you can edit its **DNS records** (or move the DNS
to Cloudflare, free).

1. **Account.** Sign up at <https://postmarkapp.com/> with your work email.
2. **Server.** *Servers* → *Create server* → name `Madmoon Deals`, colour any. It comes with a *Default Transactional
   Stream* (`outbound`), which is what the backend uses.
3. **Domain.** *Sender signatures* → *Add domain or signature* → *Domain* → `sahla.jo`. Postmark shows two
   records; add them at your domain's DNS:
   * **DKIM**: a `TXT` record (name like `20261102._domainkey`, a long `k=rsa; p=…` value): proves the email is
     really from you.
   * **Return-Path**: a `CNAME` record `pm-bounces` → `pm.mtasv.net`: bounces come back to Postmark.
   Wait a few minutes, then *Verify* next to each one.
4. **DMARC** (recommended; Gmail and Outlook trust the domain more): one more `TXT` record at your DNS,
   name `_dmarc`, value `v=DMARC1; p=none; rua=mailto:you@sahla.jo`. Later, when everything sends fine,
   change `p=none` to `p=quarantine`.
5. **Approval.** New accounts can only email addresses **at your own domain** (e.g. `you@sahla.jo`) until
   Postmark approves them. *Request approval* (a banner in the account): say it's a Jordanian marketplace app
   sending only sign-up and password-reset codes to its users, no marketing, and give the website. Usually
   about a day.
6. **Token.** *Servers* → `Madmoon Deals` → *API Tokens* → copy the **Server API token**.
7. **`backend/.env`:**
   ```
   MAIL_MODE=postmark
   POSTMARK_SERVER_TOKEN=the token
   MAIL_FROM=Madmoon Deals <no-reply@sahla.jo>
   ```
   and delete the `DEV_EMAIL_CODE=123456` line. Restart the backend (`Ctrl+C`, then `npm run dev`).
   Note: after this the demo accounts' code `123456` no longer works; real codes arrive by email.
8. **Try it.** In the app: *Sign up* with an address you can read (before approval: one at your domain). The
   email should arrive within seconds. Postmark → *Servers* → `Madmoon Deals` → *Activity* shows every email: sent,
   delivered, bounced, opened.

## When it doesn't work

| Backend log | Meaning | Fix |
|---|---|---|
| `Postmark answered 401, ErrorCode 10` | Wrong token | Step 6: the *Server* token, not the *Account* token |
| `Postmark answered 422, ErrorCode 400` | `MAIL_FROM` isn't at a verified domain | Step 3, and `MAIL_FROM` at that domain |
| `Postmark answered 422, ErrorCode 412` | Not approved yet, and the address is outside your domain | Step 5 |
| `Postmark unreachable` | Network or Postmark down | Nothing; users can ask again |
| `Email not sent: the address can't receive email` | Bad address, or it bounced before | Postmark → *Suppressions* to re-allow it |

## Production

Same three settings on the host (B12.2) as secret environment variables, no `DEV_EMAIL_CODE`.
