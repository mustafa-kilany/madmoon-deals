# Payments and escrow

**Goal:** the buyer pays by card when ordering, Sahla holds the money (escrow) until the courier
types the buyer's delivery PIN, then the seller is paid. If the item never arrives, an admin refunds.

```
POST /orders            → awaiting_payment   (the server prices it)
POST /orders/:id/pay    → escrow_held        (money held, 4-digit PIN, listing reserved)
                          or awaiting_payment + paymentUrl (the bank's card check, 3-D Secure)
courier: PIN            → completed          (listing sold, a Payout row for the seller)
admin: refund           → refunded           (money back, listing on sale again)
```

Card numbers never reach Sahla's server: the payment provider's SDK in the app turns the card into a
**token**, and only the token is sent (`cardToken`). That keeps Sahla out of most card-security
(PCI DSS) work.

## Development: the fake provider

`PAYMENT_MODE=fake` in `backend/.env` (the end-to-end tests set it themselves). The app's mock card
field makes tokens like `mock_visa_4242`, and the **last 4 digits** choose what happens, like the
test cards of real providers:

| Card ends in | What happens |
|---|---|
| `0002` | Declined: the order stays `awaiting_payment`, the buyer can try another card |
| `3155` | The bank's card check: `paymentUrl` opens a pretend bank page with **Approve** / **Decline** |
| anything else | Paid straight away (`escrow_held`) |

The fake provider keeps payments in memory, so restarting the server forgets unfinished card checks.
`PAYMENT_MODE=off` (the default) answers `503` to paying; the server refuses to start with `fake` in
production.

## The real provider (decision D2, BACKEND_PLAN B7.9)

Options for Jordan in JOD: **MEPS** (the Jordanian banks' processor), a **bank's payment gateway**,
**HyperPay**, **PayTabs**, **Checkout.com**. Ask each one:

1. Can they settle in **JOD** to a Jordanian bank account, and what are the fees per payment?
2. Do they support **3-D Secure** with a redirect (`paymentUrl`) and a server-to-server status check?
3. A **mobile SDK** (React Native, or Android + iOS) that gives a card token, and **saved cards**
   (tokens that can be charged again)?
4. **Refunds** through the API, and **payouts** to sellers (or does Sahla pay sellers by bank transfer)?
5. Their rules for **marketplaces holding money** for others (some need a licence or a special
   account type; ask the Central Bank of Jordan's rules too).

Getting a merchant account takes weeks (company registration, bank account, website with terms and
a privacy policy), so start early.

**Adding it:** write a second `PaymentProvider` next to `src/modules/payments/fake.ts` (charge,
status, refund, save / delete card), add its mode to `PAYMENT_MODE` in `src/env.ts` and its keys to
`.env`, and register our callback URL with them: `https://api.sahla.jo/v1/payments/callback`.
The orders code doesn't change.
