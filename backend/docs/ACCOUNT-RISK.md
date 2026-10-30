# Suspicious-account checker

An internal tool that watches **accounts**, not messages. It **only flags**: it never hides, blocks,
suspends or emails anyone. Flagged accounts go to an admin queue (`RiskFlag`), and a person decides.

Code: `src/modules/risk/` (`signals.ts` = the rules, `checker.ts` = scoring + queue).

## How it works

```
event (sign-up, new listing, report, block, nightly run)
   └─► checkAccount(userId)
         ├─ each rule adds points (table below)
         ├─ score < 40 → nothing happens
         └─ score ≥ 40 and no open flag → RiskFlag(open) with the signals
                                            └─ optional: AI writes a 2–3 line summary for the admin
admin opens the queue → looks at the account → Dismiss (nothing wrong) or Action (warn / suspend)
```

## Rules (signals)

| Signal | When | Points |
|---|---|---|
| `disposable_email` | Email from a throwaway service (mailinator, yopmail, …) | 30 |
| `random_email` | Machine-made address, e.g. `k8x2q9z7w1@gmail.com` | 10 |
| `shared_device` | 2+ other accounts signed in on the same phone | 15 each, max 45 |
| `listing_burst` | 15+ listings in 24 h | 20 |
| `new_account_expensive` | Account under 2 days old selling something ≥ 1000 JOD | 10 |
| `reports_received` | 2+ different people reported the account or its listings (30 days) | 10 each, max 40 |
| `blocks_received` | 3+ people blocked the account (30 days) | 15 |

Threshold: **40** (`FLAG_THRESHOLD`). Tune the points once there is real data: if admins dismiss
most flags of one kind, lower its points.

**Needs from the app (small change):** send a stable, random **device id** header
(`X-Device-Id`, generated once and stored in MMKV) on sign-up and log-in, so `shared_device` works.
Add it to `docs/API.md` when sign-in is built.

## Optional AI reviewer

Rules find the accounts; the AI only **explains** them to the admin in plain words, e.g.
*"New account (1 day), throwaway email, 3 other accounts on the same phone, 2 reports for 'scam'.
Looks like a repeat scammer making new accounts."* It never decides.

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`), through the official SDK `@anthropic-ai/sdk`.
  $4 per million input tokens and $20 per million output tokens. One flag is about 1–2 thousand
  tokens, so **a few cents per flag**.
- **Structured output:** ask for JSON `{ summary: string, likelyPattern: 'repeat_scammer' |
  'spam' | 'fake_reviews' | 'unclear' }` with `output_config.format`, so the admin list can filter
  by pattern.
- **Nightly run:** score all active accounts once a night and send the summaries through the
  **Message Batches API** (`client.messages.batches`), which costs **50% less** and finishes
  within 24 h. Live flags (e.g. right after a report) use a normal call.
- **Privacy:** send only the signals and account facts (age, sign-in method, verified, city).
  **Never names, emails, phone numbers or chat messages.** `checker.ts` already sends only these.
- **Setup:** an API key from https://console.anthropic.com → `ANTHROPIC_API_KEY` in `backend/.env`,
  then implement `AiReviewer` in `src/modules/risk/checker.ts`.

## Admin dashboard needs

- **Queue:** open flags, highest score first. For each: the signals, the AI summary, the user's
  listings, reports and other accounts on the same device.
- **Buttons:** Dismiss, Warn, Suspend (`User.suspended = true`), each with a note. Store who decided
  (`reviewedById`, `reviewedAt`).

## Ideas for later

- **Same-IMEI signal:** the same phone (IMEI hash from its test certificate) listed by two
  different accounts. See [OCR.md](OCR.md).
- **Price outlier:** price far below similar listings (same model) is a classic scam bait.
- **"Pay outside the app" in chats:** a separate, message-level check (you chose accounts only for
  now). If added, it should also only flag.
- **Verified (Sanad) accounts get fewer points**, since they are tied to a real national ID.
- **Daily email digest to the team** with the new flags (a nightly job + any email service).
