# Certified Refurbished: collecting stock

Refurbished items never come from the app. Each brand (or official dealer) gets a **store account**
(`store-apple` → "Apple Certified") and sends its stock in one of two ways. Both run the same checks
(`frontend/src/lib/refurbishedImport.ts`, shared with the app) through `src/modules/refurbished/`.

## 1. Onboard a store

```powershell
cd backend
npm run store -- create store-apple "Apple Certified" "Apple المعتمد"
npm run store -- list
```

Store ids are `store-` + the brand in lower case (letters, digits, dashes).

## 2a. They send an Excel sheet (works today, from your PC)

1. Send them [`docs/refurbished-import-template.csv`](../../docs/refurbished-import-template.csv).
   It opens in Excel and has one row per item.
2. They fill it in and send it back. In Excel: **File → Save As → "CSV UTF-8"**. Plain "CSV" breaks
   the Arabic.
3. Check it first (saves nothing):
   ```powershell
   npm run store -- import store-apple C:\path\to\apple-stock.csv --dry-run
   ```
   Each problem is printed with its **Excel row number**, e.g.
   `Excel row 7 (iphone-12-64) priceJod: Above 0, at most 3 decimals`.
4. Publish:
   ```powershell
   npm run store -- import store-apple C:\path\to\apple-stock.csv
   ```
   Add `--replace` when the sheet is their **whole** stock: their listings missing from the sheet are
   taken off sale.

Later, the admin dashboard does the same thing with an upload button (it calls the API with
`dryRun: true` first).

## 2b. Their system calls the API (automatic)

```powershell
npm run store -- key store-apple "Apple stock system"
```

This prints a key (`sahla_sk_…`) **once**. Send it to them privately (never by plain email), together
with [`docs/API.md` → Certified Refurbished import](../../docs/API.md#certified-refurbished-import-admin-dashboard--brand-systems).
They call:

```
POST https://api.sahla.jo/v1/admin/refurbished/import
Authorization: Bearer sahla_sk_…
{ "storeId": "store-apple", "mode": "upsert", "items": [ … up to 1000 … ] }
```

- Same `sku` again = update that listing (price, photos, warranty…), so saved items and links keep
  working.
- `DELETE /v1/admin/refurbished/store-apple/<sku>` takes one item off sale.
- Lost or leaked key: `npm run store -- revoke <keyId>` (the id is in `npm run store -- list`), then
  make a new one.

## Rules worth telling brands

- Grades: `like_new`, `excellent`, `good`. Warranty 0–36 months (0 = inspected, no warranty).
- **Fixed price only**, in JOD with up to 3 decimals (`365.5`). No auctions: the vendor sets the price.
  A sheet that still has the old `auctionEndsAt` / `auctionIncrementJod` columns filled in is refused.
- 1–5 public `https://` photos, cover first; in Excel, one cell with `|` between URLs.
- Description: at least 10 words.
- An item with an **open order** (paid, not delivered) isn't changed. A **sold** sku can't be reused:
  restocked items need a new sku.
- No test certificate needed: the brand certifies the item.

## Still to do

- Copy the brands' photos to Sahla's own storage/CDN (now the listing links to their URLs).
- Admin dashboard: upload button, import history (`RefurbishedImport` rows), per-store stock.

## Ideas to get the first stores

- Start with **2–3 big Jordanian phone dealers** that already sell refurbished stock (official Apple
  / Samsung resellers). The brands themselves come later, once there's traffic.
- Offer **zero commission for the first 3 months** and fill in the sheet **for** them from their
  existing price list.
- A **"Certified Refurbished" landing page** with each store's logo and warranty terms builds trust
  quickly.
- A weekly **deal of the week** (one discounted flagship per store, at a fixed price) brings traffic to
  the store page.
