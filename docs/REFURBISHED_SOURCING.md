# Certified Refurbished: what it is and where the stock comes from

## What "refurbished" means on Madmoon Deals

**Devices a customer returned to the vendor (usually for a defect), that the vendor repaired, tested and
sells again, with a warranty.** The seller is always the vendor (or Madmoon Deals itself, see below), never an
app user:

- Users can't list refurbished items: `POST /listings` refuses the `refurbished_*` conditions.
- Refurbished stock only arrives through a **store account**: the Excel import, the store's API key, or
  (planned, B8.7) a connector to the store's own online shop.
- Always **fixed price**: the vendor sets it, no auctions.
- Every item has a **grade** (like new / excellent / good) and a **warranty** (0–36 months).

## Where the stock can come from

### Option 1: Jordanian vendors (what Madmoon Deals supports today)
Local shops and authorised resellers that already take back and repair returns sell through their own
store account on Madmoon Deals. **No importing, no customs, fast delivery.** Limited by how much refurbished
stock local shops actually have; there's no Jordanian certification for "refurbished", so Madmoon Deals' own
rules (grade, battery health, warranty, returns) go into each vendor's contract.

### Option 2: Madmoon Deals imports stock from Europe / the US / the UAE and sells it itself
Madmoon Deals buys **graded refurbished stock in bulk** from B2B suppliers, ships it to Jordan, clears customs,
keeps it in Amman, and sells it under its own store account (e.g. `store-madmoon` "Madmoon Deals Certified").

| Where to buy | What it is | Notes |
|---|---|---|
| [Back Market Pro](https://pro.backmarket.com/) | Back Market's business arm: refurbished phones, tablets, laptops | States a 1-year minimum warranty and bank transfer / 30-day terms; check whether they ship to Jordan |
| [B2B Mobiles Europe](https://www.b2bmobiles.eu/) (Spain) | Wholesale phones, tablets, laptops | Says it supplies the Middle East with graded stock and documents |
| [RecirQ](https://www.recirqglobal.com/) (US) | Used and refurbished unlocked iPhones and other phones | Says it ships to resellers in the Middle East |
| [HGC Technologies](https://hgctechnologies.uk/wholesale/) (UK) | Refurbished laptops | Says it ships 50–150+ unit batches to GCC buyers |
| UAE wholesalers, e.g. [UAEPC](https://uaepc.com/en/products/laptops), [Recycle Emirates](https://www.africa-business.com/profiles/recycle.html), [GSMBid](https://gsmbid.com/) (auctions) | Graded laptops and phones, often with minimum orders (~100 pieces) | **Closest**: cheaper and faster shipping to Amman than Europe / the US |
| [B-Stock](https://bstock.com/) (US) | Retailers' **customer returns** (Walmart, Best Buy, …) in lots | Cheapest, closest to "returned for a defect", but **not refurbished**: Madmoon Deals (or a partner repair shop) must test, repair and grade every unit. Buyers arrange their own shipping |

These are the suppliers' own descriptions; check each one (samples, references, warranty terms, export
documents) before paying.

**Why this option first if you import:** stock is already in Jordan when a customer buys, so delivery
is 1–2 days, escrow works as today, returns are local, and customs and approvals are done once per
shipment, not per customer.

### Option 3: Order on demand (no stock)
Madmoon Deals lists items from a foreign supplier's catalogue (with their permission and feed), and orders each
one only after a customer pays; the supplier or a forwarder ships it to Jordan. **No money tied up in
stock, but:** 1–3 weeks delivery, customs and approvals per parcel, prices that change with shipping,
and returns that go back abroad. Better as a later step, for expensive or rare items, once Option 2 runs.

## Before importing: rules in Jordan to check (with a customs broker)

- **Phones and other wireless devices need TRC type approval** (Telecommunications Regulatory
  Commission; under the 2025 instructions it reportedly takes 6–10 weeks per model and needs a business
  licence, a Declaration of Conformity, test reports and a GSMA IMEI certificate). Imported phones must
  also be **registered**, or carriers can block them. The personal-use allowance (reportedly up to 6
  phones) does **not** cover selling. Sources: [Telecompaper](https://www.telecompaper.com/news/jordans-trc-orders-registration-of-imported-mobile-devices--1534037),
  [C-PRAV](https://c-prav.com/2025/11/13/jordan-updates-its-type-approval-framework-for-telecom-equipment/),
  [Nanotech](https://www.nanotechsol.com/jordan-trc-type-approval).
- **Customs and tax:** the [Jordan Trade Portal](https://tradeportal.customs.gov.jo/procedure/1771/step/10710?l=en)
  lists a mobile-phone import procedure with its own duties and taxes step; brokers say duty on
  electronics is often 0–10% (often 0% under the US–Jordan or EU–Jordan agreements, with rules of
  origin), plus sales tax. Get exact figures per product from a broker.
- **Lithium batteries** (every phone and laptop) have special air-freight rules; the freight forwarder
  handles the packing and paperwork.
- **Warranty:** manufacturer refurbished warranties are often valid only in the country of sale, so the
  supplier's or **Madmoon Deals' own warranty** is what the customer gets. Price it in.
- **Start with laptops and tablets** if phone approvals are slow; check whether Wi-Fi devices need
  type approval too.

## What this means for the app and backend

| Need | Status |
|---|---|
| Madmoon Deals' own store account (`store-madmoon`), stock imported with the Excel sheet | ✅ works today (`npm run store`) |
| Users can't list refurbished | ✅ |
| **Several identical units under one listing** (bulk stock: 20 × iPhone 13 128GB grade A) | planned: `Listing.quantity` for store listings; an order reserves one unit, the listing stays on sale until the last |
| **Landed-cost price calculator** in the dashboard (buy price + shipping + customs + tax + approval + warranty + margin → JOD price) | planned (dashboard) |
| Order on demand (Option 3): "ships from abroad, 1–3 weeks", order steps for ordering, transit and customs | later, only if Option 3 is chosen |

See `BACKEND_PLAN.md` → B13 and decision D8.
