# Sahla — Development Guide

The single reference for building the Sahla mobile app (Android + iOS) with React Native.
It covers the rules, design patterns, architecture, the development roadmap from start to
release, and every dependency needed to begin.

**Repository layout (since 2026-10-30):** the app lives in **`frontend/`**, the API in **`backend/`**
(Express + PostgreSQL, see `backend/README.md` and `docs/BACKEND_PLAN.md`), and the shared contract in
`docs/`. **App paths in this guide (`src/…`, `android/…`, `ios/…`, `__tests__/…`, `.maestro/…`,
`tools/…`, `package.json`) are inside `frontend/`**, and app commands (`npm start`, `npm run android`,
`npm test`, …) run there. In Android Studio, open `frontend/android`.

**Source of truth for the design:** the Figma Make file
[Mobile-UI-Design-System](https://www.figma.com/make/uE74X70B5p5gtlztYWTFZy/Mobile-UI-Design-System).
It is a working web prototype (React + Tailwind + Vite). We port its screens, tokens and logic
to React Native; we do not copy its web markup.

**Local reference copy:** `C:\Users\mustafa\Desktop\Sahla\figma-prototype` (outside this repo, with its
own git history: one commit per design sync), copied from the Make file via the Figma MCP. Run it with `npm run dev` there → http://localhost:5173. Any
screen opens directly with URL params, e.g. `?screen=checkout&lang=ar&user=1&category=tech&item=0`
(also `sidebar=1`, `filters=1`, `user=verified`, `q=<search>`; `item=4` is a category's demo
auction). Phone-size screenshots of 21 views in English and Arabic are in its `screenshots/` folder:
these are the visual target for each React Native screen. Last synced with Figma: 2026-10-18 (design
update adding the Auctions tab); the pre-update set is kept in `screenshots/previous/`.

---

## 1. Product Summary

Sahla is a bilingual (Arabic RTL / English LTR) second-hand marketplace for Jordan.
Tone: warm, local, trustworthy.

| User | Can do |
|---|---|
| Guest | Browse categories, search, view items. Asked to sign in before buying, bidding, chatting or selling. |
| Buyer | Filter, save favourites, make offers in chat, bid in auctions, pay through escrow, track the order. |
| Seller | Create listings (photos, category, condition, brand, price), fixed price or auction, accept/counter offers. Earns a **Verified Seller** badge after national ID verification. Verified sellers rank first. |
| Courier | Enters the buyer's delivery PIN to confirm handoff, which releases payment to the seller. |

### Screens to port (from the prototype)

| # | Screen | Prototype file | Auth required |
|---|---|---|---|
| 1 | Home dashboard | `HomeDashboard.tsx` | No |
| 2 | Search | `SearchScreen.tsx` | No |
| 2b | Auctions tab (live auctions, search, category chips) | `AuctionsScreen.tsx` | No |
| 2c | Certified Refurbished store (brand-store listings with warranty; type chips, Shop by brand). Stock is imported, never listed in the app: `POST /admin/refurbished/import` (docs/API.md) | `RefurbishedScreen.tsx` | No |
| 3 | Category (+ filter sheet) | `CategoryScreen.tsx`, `FilterSheet.tsx` | No |
| 4 | Product detail (+ the shop test certificate on phones / electronics) | `ProductDetail.tsx` | No |
| 5 | Saved items | `SavedItems.tsx` | No (local) |
| 6 | Auth (choose method) | `AuthScreen.tsx` | — |
| 7 | Email auth | `EmailAuth.tsx` | — |
| 8 | ID verification | `IDVerification.tsx` | — |
| 9 | Profile | `Profile.tsx` | Yes |
| 10 | Add listing: description of 10+ words required; phones and electronics need a shop test certificate photo, checked by the server (OCR) via `POST /test-certificates` | `AddListing.tsx` | Yes |
| 11 | Make offer | `MakeOffer.tsx` | Yes |
| 12 | Secure chat | `SecureChat.tsx` | Yes |
| 13 | Auction detail + bidding | `AuctionBidding.tsx` | To bid |
| 14 | Checkout: with no saved address, a prompt offers to fill the area and street from the buyer's location (`GET /geocode/reverse`); fields stay editable | `Checkout.tsx` | Yes |
| 15 | Order tracking | `BuyerTracking.tsx` | Yes |
| 16 | Courier app | `CourierApp.tsx` | Yes (courier role) |
| — | Sidebar menu, bottom nav (Home · Auctions · Sell · Chats · Profile), toast, back button | `components/` | — |
| — | Shared listing browser: format tabs (All / Buy now / Auctions) + Refurbished switch, category chips, filters, sort, result grid. Used by Search results, Auctions, Category and the Refurbished store. The prototype's "New" switch is left out on purpose: the marketplace has no brand-new stock. | `components/ListingBrowser.tsx`, `lib/browsing.ts` | — |
| — | UI primitives (Button, Input, Select, Heading) | `components/ui/` | — |

The prototype's `*.py` helper scripts (`fix_app*.py`, `translate_*.py`, …) are build leftovers
and are **not** part of the app.

---

## 2. Design System

### 2.1 Colors

**Approved palette** (sage green / brick red / warm cream). The "Local Market" Terracotta palette
in the prototype's `DESIGN_SYSTEM.md` is outdated and must **not** be used.

| Token | Hex | Used for |
|---|---|---|
| `brand-primary` | `#7D9C65` | Sage green: main buttons, active nav, prices |
| `brand-on-primary` | `#FFFFFF` | Text and icons on primary |
| `brand-secondary` | `#B93636` | Brick red accent (auction timer icon) |
| `brand-espresso` | `#2C1E16` | Main text, auction card background |
| `brand-warmgray` | `#78716C` | Secondary text, idle nav icons |
| `brand-lightgray` | `#FFFDF4` | Page background (warm cream) |
| `brand-surface` | `#FFFFFF` | Cards, header, nav bar |
| `brand-muted` | `#FFF2A0` | Soft yellow highlight |
| `brand-border` | `#EAE6DF` | Borders and dividers |
| `brand-success` | `#7D9C65` | Verified badge, "New" tag text |
| `brand-success-soft` | `#F1F4ED` | "New" tag background |
| `brand-danger` | `#DC2626` | Errors, "Used - Loved" tag text |
| `brand-danger-soft` | `#FEE2E2` | "Used - Loved" tag background |
| `brand-info` | `#2563EB` | "Used - Excellent" tag text |
| `brand-info-soft` | `#DBEAFE` | "Used - Excellent" tag background |
| `brand-warning-text` | `#92400E` | "Used - Good" tag text |
| `brand-warning-soft` | `#FEF3C7` | "Used - Good" tag background |

**Condition tags** (one `ConditionTag` component, driven by the item's condition):

| Condition | Text | Background |
|---|---|---|
| New | `brand-success` | `brand-success-soft` |
| Used - Excellent | `brand-info` | `brand-info-soft` |
| Used - Good | `brand-warning-text` | `brand-warning-soft` |
| Used - Loved | `brand-danger` | `brand-danger-soft` |

**Rule:** colors are only ever referenced through tokens (`bg-brand-primary`, `colors.primary`),
defined once in `src/theme/colors.ts` and fed to the NativeWind config.
No hex values inside screens or components.

### 2.2 Typography

| Role | Font | Weights | Class |
|---|---|---|---|
| Headings, prices | **Cairo** | 600, 700, 800, 900 | `font-heading-semibold/bold/extrabold/black` |
| Body, labels, inputs, buttons | **IBM Plex Sans Arabic** | 400, 500, 600, 700 | `font-sans-regular/medium/semibold/bold` |

Both support Arabic and Latin. On mobile, fonts are **bundled as `.ttf` files** in `assets/fonts`
(no Google Fonts CDN). React Native needs one font file per weight, so each weight gets its own family
name, which is also the file name and the font's PostScript name, so one string works on Android and
iOS (e.g. `Cairo-Black`, `IBMPlexSansArabic-Bold`). After adding a font file run
`npx react-native-asset`. Never add `fontWeight` to these: Android would fall back to the system font.

Porting classes: prototype `font-heading font-black` → `font-heading-black`; prototype `font-bold`
(body font) → `font-sans-bold`. Buttons use Plex Bold, as in the prototype. `ui/Text` defaults to
`font-sans-regular text-brand-espresso`.

| Scale | Size | Weight |
|---|---|---|
| Screen title | 20 | Cairo 900 |
| Section title | 14 | Cairo 900 |
| Body | 14 | Plex 700 |
| Caption | 12 | Plex 400–500 |

### 2.3 Spacing, radius, elevation

| Token | Value |
|---|---|
| Screen horizontal padding | 20 (`px-5`) |
| Gap between items | 12 / 16 (`gap-3` / `gap-4`) |
| Radius: input, button | 12 (`rounded-xl`) |
| Radius: card | 16 (`rounded-2xl`) |
| Card shadow | Small (`shadow-sm`; `elevation: 1–2` on Android) |

### 2.4 Icons

- **UI icons:** line SVGs ported from `src/components/icons.tsx` to `react-native-svg`.
  24×24 grid, outline only, stroke width **2.5**, round caps and joins, color = current text color.
  Sizes: 16 inline · 20 lists · 24 navigation.
  Groups: Navigation (Home, Search, Add, Chat, Profile, Menu, ChevronLeft/Right, Grid, Filter) ·
  Commerce (Tag, Gavel, CreditCard, Box, Truck, Heart, Share, Star) ·
  Trust (Lock, Shield, BadgeCheck, IdCard, Eye, Check) · Utility (Camera, MapPin, Clock, Mail, Settings).
- **Category icons:** square photo tiles with a thin border, falling back to the line icon if the
  image fails. Categories: Clothing, Tech, Vehicles, Furniture, Shoes, Gaming, Watches, More.
- **Directional icons** (chevrons, back arrow) must flip in RTL.

### 2.5 Core components

| Component | Rule |
|---|---|
| `Button` (primary) | `primary` background, white Plex Bold text, radius 12, vertical padding 16, scales to 0.98 on press |
| `Button` (secondary) | `surface` background, 2px `border` |
| `Card` | `surface`, radius 16, small shadow |
| `TextField` | 2px border, radius 12, `primary` border on focus, error text in `danger` |
| `Toast` | Short message at the top, `success` / `info`, auto-dismiss after ~2.6 s |
| `BottomNav` | 5 tabs (Home, Auctions, **Sell**, Chats, Profile); center **Sell** button is raised and opens Add Listing |
| `ProductCard` | Image, title, price (JOD), verified badge, favourite heart |
| `FilterSheet` | Bottom sheet: type, brand, condition, min/max price |
| `SidebarMenu` | Slide-in drawer from the *start* edge (left in LTR, right in RTL) |
| `BackButton` | Chevron that points toward the *start* edge |

---

## 3. Rules

### 3.1 Language and direction (RTL)

1. **Every user-facing string goes through i18n**: `t('home.title')`. No hard-coded text in JSX.
   Arabic and English strings live in `src/i18n/ar.json` and `src/i18n/en.json` (keys are
   type-checked, and a test fails if the two files' keys differ). Text that comes with the data
   (listing titles, seller names) is stored in both languages as `{ ar, en }` and shown with
   `useLocalized()`.
2. Use **logical** layout properties only: `marginStart/End`, `paddingStart/End`, `start/end`
   (NativeWind: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`). **Never** `left/right`, `ml-`, `mr-`.
3. Use `flexDirection: 'row'`; React Native flips it automatically in RTL. Don't add manual
   `row-reverse` for RTL.
4. Numbers, prices, card numbers and PINs always display **left-to-right**: wrap them with
   `ltr(value)` or `<Ltr>` (`components/ui/Ltr.tsx`), which use Unicode directional isolates because
   Android ignores `writingDirection`.
5. Switching language calls `changeLanguage()` (`src/i18n`): it saves the choice, calls
   `I18nManager.allowRTL()` + `forceRTL()` and **restarts the app** (`react-native-restart`); React
   Native only applies direction changes on reload. `index.js` also re-applies the saved direction at
   startup, so an Arabic-language phone still opens in English LTR on first launch.
6. Test every screen in **both** Arabic and English before it is marked done.

### 3.2 Money and payments

1. Currency is **Jordanian Dinar (JOD / د.أ)**. JOD has 3 decimals (1 JOD = 1000 fils).
2. Store and compute all amounts as **integers in fils**. Never use floating-point for money.
   Format only at display time, as the prototype does: amount first, unit after, Western digits,
   decimals only when there are fils (`formatJOD(520000, 'en') → "520 JOD"`,
   `formatJOD(12500, 'ar') → "12.500 د.أ"`; `src/lib/money.ts`).
3. Checkout breakdown:

   | Line | Amount |
   |---|---|
   | Item price | Agreed price (fixed, accepted offer, or winning bid) |
   | Buyer protection | **3%** of item price, **minimum 1 JOD** |
   | Delivery | **2 JOD** flat |
   | **Total** | Item + Protection + Delivery |

4. The pricing logic lives in **one pure function** (`calculateCheckoutBreakdown` in `src/lib/money.ts`) with
   unit tests. Screens never compute fees themselves.
5. Card numbers are never shown in full: only `•••• 1234`. The app never stores raw card data;
   a payment provider's SDK handles card entry (tokenization).

### 3.3 Escrow flow

```
1. Buyer pays        → card at Checkout
2. Money held        → Sahla escrow ("Payment held safely in escrow")
3. Seller ships      → courier picks up the item
4. Buyer gets PIN    → shown on Order Tracking
5. Delivery          → buyer gives the PIN to the courier
6. Courier confirms  → enters the PIN in the Courier App
7. Release           → escrow pays the seller
```

- Wrong PIN → money is **not** released.
- Item never arrives → buyer is **refunded** from escrow.
- PIN validation and escrow release happen **on the server**, never on the device.

### 3.4 Auth gating

- Browsing is open to guests.
- Buy, bid, offer, chat, sell → `requireAuth(route)`: if signed out, open Auth, remember the
  intended route, and continue there after sign-in (same behavior as the prototype's
  `pendingAction` / `finishAuth`).
- The Courier App is only reachable by accounts with the courier role.

### 3.5 Code rules

1. **TypeScript strict.** No `any` except at third-party boundaries.
2. **Function components + hooks** only.
3. One component per file. File names `PascalCase.tsx` for components, `camelCase.ts` for
   utilities and hooks (`useFavorites.ts`).
4. Screens are thin: they compose components and call hooks. Business logic lives in
   `features/*/` hooks, services and pure functions.
5. No inline hex colors, magic font sizes or hard-coded strings in screens.
6. Lists use `FlatList` / `FlashList`, never `.map()` inside a `ScrollView` for long data.
7. Every tappable element has `accessibilityRole` and an `accessibilityLabel` (translated).
   Minimum touch target 44×44.
8. Prettier + ESLint and the type check must pass before committing (`npm run lint`, `npm run typecheck`).
9. Commits follow **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`.
10. Work on feature branches (`feat/home-screen`), merge to `main` through pull requests
    (see §3.6).
11. **NativeWind:** a component must not *gain* shadow / ring / transform / animation classes
    after its first render (they use CSS variables; NativeWind then remounts it, and in
    development its warning crashes the app). Toggle between two values instead:
    `active ? 'shadow-sm' : 'shadow-none'`, never `active ? 'shadow-sm' : ''`.
12. **Layout:** inside auto-height containers use `grow`, not `flex-1` (`flex-1` starts from zero
    height in React Native and can collapse the view).
13. Use `ui/Text` rather than React Native's `Text` (default font and color). Android text that
    appears after launch could be drawn narrower than measured and lose its last word; fixed by
    enabling React Native's `enablePreparedTextLayout` flag in `MainApplication.kt` — keep it on.
14. Reanimated `Animated.View`s take `style`, not `className`.
15. **Data flow:** screens → feature hooks (`features/*/hooks`, TanStack Query) → services
    (`services/*`) → mock or HTTP. Screens never import a service or mock data directly. See §4.4.

### 3.6 Git and GitHub

Repo: `github.com/mustafa-kilany/Sahla`, using **GitHub Flow**: one long-lived branch (`main`)
plus short-lived branches for each piece of work.

- `main` always builds and passes CI. Nobody pushes to it directly.
- Start each piece of work from an up-to-date `main`:
  `git switch main`, `git pull`, then `git switch -c feat/<short-name>`.
  Prefixes match the commit types: `feat/`, `fix/`, `refactor/`, `chore/`, `test/`, `docs/`.
- Push the branch (`git push -u origin feat/<short-name>`) and open a pull request into `main`.
  The PR template has the checklist. CI (`.github/workflows/ci.yml`) runs the type check,
  lint and unit tests.
- Merge with **Squash and merge** when CI is green, then delete the branch.
- Each finished roadmap phase gets a tag (`phase-1` … `phase-7` so far). Store releases are
  tagged `v1.0.0`, `v1.0.1`, … (Phase 9).
- One-time GitHub settings (done in the browser by the repo owner), under **Settings** →
  **Rules** → **Rulesets**: protect `main` (require a pull request, require the `CI` check,
  block force pushes and deletion).

---

## 4. Architecture and Design Patterns

### 4.1 Folder structure

```
frontend/                       # the app (the repo root also has backend/ and docs/)
├── App.tsx                     # Providers + RootNavigator only
├── index.js
├── assets/
│   ├── fonts/                  # Cairo-*.ttf, IBMPlexSansArabic-*.ttf
│   └── images/                 # Bundled images (category tiles, placeholders)
├── src/
│   ├── theme/                  # Design tokens
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   └── spacing.ts
│   ├── i18n/                   # i18next setup + ar.json / en.json
│   ├── navigation/
│   │   ├── RootNavigator.tsx   # Stack: tabs + modal/detail screens
│   │   ├── TabNavigator.tsx    # Bottom tabs with raised Add button
│   │   ├── linking.ts          # Deep links
│   │   └── types.ts            # Typed route params
│   ├── components/             # Shared, dumb UI (no data fetching)
│   │   ├── ui/                 # Button, Card, TextField, Chip, Badge, Ltr, Screen
│   │   ├── icons/              # SVG icon set
│   │   ├── ProductCard.tsx
│   │   ├── CategoryIcon.tsx
│   │   ├── BottomNav.tsx
│   │   ├── FilterSheet.tsx
│   │   ├── SidebarMenu.tsx
│   │   └── Toast.tsx
│   ├── features/               # One folder per domain
│   │   ├── auth/               # screens/, hooks/, api.ts, store.ts
│   │   ├── catalog/            # home, category, search, product detail
│   │   ├── favorites/
│   │   ├── listings/           # add listing
│   │   ├── offers/             # make offer, chat
│   │   ├── auctions/
│   │   ├── checkout/           # checkout screen + order hooks (pricing: lib/money.ts)
│   │   ├── orders/             # buyer tracking
│   │   └── courier/
│   ├── config.ts               # apiBaseUrl, per-service mock switches (§4.4)
│   ├── services/               # Data access, one folder per domain (§4.4)
│   │   ├── api/                # HTTP client, ApiError, tokenStorage
│   │   ├── catalog/            # types.ts (interface) · mock.ts · http.ts · index.ts (picks one)
│   │   ├── auth/               # same shape
│   │   ├── payments/           # card tokenization (provider SDK later)
│   │   ├── mock/               # mock backend: seed data, demo account, latency, storage
│   │   └── queryClient.ts      # TanStack Query client + all query keys
│   ├── store/                  # Global client state (Zustand)
│   ├── lib/                    # formatJOD, itemKey, validators, types.ts
│   └── hooks/                  # Cross-feature hooks
├── docs/API.md                 # API contract the backend implements
└── __tests__/
```

### 4.2 Patterns

| Concern | Pattern | Why |
|---|---|---|
| Navigation | **React Navigation** native stack + bottom tabs, typed params | The prototype's `switch (currentScreen)` router becomes real navigation with back gestures, Android back button and deep links |
| UI composition | **Presentational vs. container**: `components/` are pure, `features/*/screens` wire data | Components are reusable and testable |
| Design tokens | **Single theme source** (`src/theme`) consumed by NativeWind config | Changing a color updates the whole app |
| Client state | **Zustand** stores split by domain (`authStore`, `favoritesStore`, `uiStore`) | Replaces the prototype's one giant `AppContext`; avoids re-rendering every screen on any change |
| Server state | **TanStack Query** (`useQuery` / `useMutation`) | Caching, loading/error states, retries, pagination |
| Data access | **Repository / service layer** (`services/api`) behind interfaces, with a **mock implementation** | Build the full UI on mock data before the backend exists, then swap |
| Persistence | **MMKV** for favourites, recent searches, language, session token (encrypted) | Fast synchronous storage |
| Forms | **React Hook Form + Zod** schemas | Validation for auth, listing, offer, checkout |
| Business logic | **Pure functions** (pricing, filters, ranking verified sellers first) | Easy to unit-test |
| Feedback | Global **toast** service (`toast.success(t('saved'))`) | Matches prototype `showToast` |
| Errors | Error boundary per navigator + typed API errors | No white screens |

### 4.3 Mapping the prototype to React Native

| Prototype (web) | React Native |
|---|---|
| `<div>` / `<span>` / `<p>` | `<View>` / `<Text>` |
| `<img>` | `<Image>` (`FastImage` for remote lists) |
| `<button onClick>` | `<Pressable onPress>` |
| `<input>` | `<TextInput>` |
| Tailwind classes | NativeWind classes (same names, mostly) |
| `overflow-y-auto` lists | `FlatList` / `FlashList` |
| `currentScreen` + `navigate()` | `navigation.navigate('Product', { id })` |
| `useApp()` context | Zustand stores + TanStack Query hooks |
| `t("عربي", "English")` inline | `t('key')` with JSON dictionaries |
| `dir="rtl"` | `I18nManager.forceRTL(true)` + restart |
| Fixed phone frame | `SafeAreaView` / `useSafeAreaInsets` |
| Fixed overlay sheet | `Modal` + Reanimated (`FilterSheet`, `ui/Select`) |
| Sidebar `div` | Drawer (Reanimated) or React Navigation Drawer |

### 4.4 Backend readiness (mock now, API later)

The app is built against the **API contract in `docs/API.md`** from day one. Every data area is
a service with one interface and two implementations:

```
screen → hook (features/*/hooks, TanStack Query) → service interface (services/<domain>/types.ts)
                                                     ├─ mock.ts  in-app mock backend (today)
                                                     └─ http.ts  real API via services/api/client.ts
```

- `src/config.ts` picks the implementation per service: `mock: { catalog: true, auth: true }`
  today. **Connecting the backend = set `apiBaseUrl`, switch each service to `false` as the API
  ships it** (e.g. accounts before catalog). No screen changes.
- `tools/contract-server` is a small local server that implements `docs/API.md` for real (hashed
  passwords, tokens, file uploads). Run `npm run contract-server`, point the app at
  `http://10.0.2.2:4000/v1` with `mock.auth: false`, and every account call goes over real HTTP.
  `__tests__/contract.test.ts` runs the HTTP services against it automatically. It is a test
  stand-in for the backend, not the backend.
- The mock behaves like a server: simulated latency, accounts and sessions stored on the device,
  the token read like an `Authorization` header, and the contract's error codes
  (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`, …). Loading and error states are therefore real today.
  Demo account: `ahmad@sahla.jo` / `sahla1234`.
- `http.ts` files are written to the contract and map wire format to app types (e.g. ISO dates →
  timestamps, `imageUrl` → image source). `__tests__/apiClient.test.ts` checks them with a fake
  `fetch`.
- Errors are `ApiError` with a `code`; screens show `t(errorMessageKey(error))`. A 401 signs out.
- The session token lives in `services/api/tokenStorage.ts` (MMKV). **Before release** move it
  to the keychain (`react-native-keychain`) — only that file changes.
- Card numbers never reach the Sahla API: `services/payments` tokenizes (mock now, provider SDK
  later) and the API stores the token.

**Adding an endpoint:** (1) describe it in `docs/API.md`, (2) add the method to the service's
`types.ts`, (3) implement it in `mock.ts` and `http.ts`, (4) expose it through a hook, (5) test
the mock (and the mapping, if any).

---

## 5. Development Roadmap (Start → Release)

Each phase ends with a working build on an Android emulator (and iOS, see §6.3).

### Phase 0 — Environment setup ✅ Done (2026-10-18)
- Install the toolchain in §6.1–6.3.
- Run the starter app on an Android emulator: `npm run android`.
- Add Prettier/ESLint config, path aliases (`@/` → `src/`), strict TypeScript.
- **Done when:** the default app runs and `npm run lint` + `npm test` pass.

### Phase 1 — Foundation ✅ Done on Android (2026-10-18; tag `phase-1`; iOS cloud build still to run)
- Install core dependencies (§7).
- Theme tokens (`src/theme`), NativeWind config (`tailwind.config.js` reads the tokens, so classes
  match the prototype: `bg-brand-primary`, …; `inlineRem: 16` in `metro.config.js` so spacing matches
  web Tailwind), bundled fonts (Android + iOS linking).
- i18n with ar/en, RTL switching + restart.
- Icon set ported to `react-native-svg` (`components/icons`, `<Icon name size color />`).
- UI kit (`components/ui`): `Text`, `Heading`, `Button`, `Card`, `TextField`, `Chip`, `Badge`, `Ltr`,
  `Screen`; plus `Toast` (+ `toast.success()` store), `BackButton`.
- Navigation shell: root stack, bottom tabs with raised Sell button, sidebar. Screens not yet
  ported render `PlaceholderScreen`.
- Mock data service (`services/catalog.ts` → `services/mock/catalog.ts`) seeded from the prototype's
  `catalog.ts`, with TanStack Query hooks in `features/catalog/hooks`. Category tile images are
  bundled in `assets/images/categories`; listing photos stay remote URLs, like real listing images.
- **Done when:** empty tab screens navigate correctly in both languages.

### Phase 2 — Browsing (guest) ✅ Done on Android (2026-10-19; tag `phase-2`)
- Home dashboard, category screen + filter sheet, search (recent searches), product detail,
  saved items (local favourites), Auctions tab (browsing only; the auction page itself is Phase 5).
- Verified sellers ranked first.
- Shared pieces: `ListingBrowser` (format tabs, category chips, Filters + Sort, filter chips),
  `ProductGrid` / `ProductCard`, `FilterSheet`, `ui/Select`, `ItemRail`, `Price`, `ConditionTag`.
  Pure logic in `lib/browsing.ts` (unit-tested). Favourites and history persist in MMKV
  (`features/favorites/store.ts`, `features/catalog/historyStore.ts`).
- Filter sheet and dropdown are built on React Native `Modal` + Reanimated, so
  `@gorhom/bottom-sheet` isn't needed. `FlatList` is enough for the seed catalog; revisit
  FlashList / cached images when real data arrives (Phase 7).
- **Done when:** a guest can browse, filter, search and save items, in Arabic and English.

### Phase 3 — Accounts and trust (tag `phase-3`)
- Backend-ready data layer (§4.4): `config.ts`, HTTP client, `ApiError`, token storage, catalog /
  auth / payments services each with mock + HTTP implementations, `docs/API.md`.
- Auth choice, email sign-up **and log-in** (log-in isn't in the prototype; a real backend needs
  it), React Hook Form + Zod validation, `useRequireAuth` gating with redirect-after-login
  (`features/auth/authFlow.ts`): Sell, Make an Offer, Pay Now, Chat, Profile.
- ID verification flow: the prototype's simulated scan. The photo comes from
  `features/auth/idCapture.ts`; a real camera / image picker replaces that one function later
  (needs a native module and a rebuild).
- Profile (guest prompt / account: avatar, verification, city, payment card, my listings, log
  out), sidebar and Home greeting show the signed-in user. Session refreshes from `GET /me` at
  launch.

### Phase 4 — Selling
- Add listing: multi-step form (photos, category, condition, brand, price),
  fixed price vs. auction.
- My listings on Profile.

### Phase 5 — Negotiation
- Secure chat (real-time), make offer, seller accept / counter.
- Auction bidding (live updates, countdown).

### Phase 6 — Checkout, escrow and delivery ✅ Done in the app (2026-10-19; mock backend)
- Checkout with pricing breakdown (`calculateCheckoutBreakdown` in `src/lib/money.ts`,
  unit-tested): listing price, or the accepted offer's price from chat ("Proceed to Checkout").
  Saved card or a typed card number → `paymentProvider.tokenizeCard` → `POST /orders/:id/pay`.
- Order tracking (`features/orders`): order number, escrow timeline, delivery PIN, pull to refresh.
- Courier: same app, `user.role === 'courier'` (decision §8 #7). "Confirm a Delivery" in the
  menu → order number + PIN → server validates → escrow released. Demo courier:
  `courier@sahla.jo` / `sahla1234` (mock backend).
- **Still open:** the real payment provider SDK and its card field replace the typed card number
  once the provider is chosen (§8 #4); won-auction checkout waits for auction closing on the
  server (Phase 7); the contract server has no `/orders` routes yet.

### Phase 7 — Backend integration (app side ✅ 2026-10-20; backend in progress in `backend/`)
- **Backend plan, phase by phase: [`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md).**
- The backend (`backend/`, Express + PostgreSQL) implements `docs/API.md`; the app flips each service in
  `src/config.ts` → `mock` (catalog, auth, negotiation, orders) as its endpoints go live (§4.4).
  Release builds use the production `apiBaseUrl`, debug builds the local contract server.
- ✅ Contract checked by `__tests__/httpContract.test.ts`: every request the app makes (method,
  path, body) and that each endpoint is documented in `docs/API.md`. Dates are ISO strings on
  the wire, converted in `src/services/api/wire.ts`.
- ✅ Session token in the device keychain (`react-native-keychain`; old MMKV tokens migrate on
  first launch). Verified on the emulator: the session survives an app restart.
- ✅ Listing photos are uploaded (`POST /uploads/listing-photo`), then the listing is created
  with their URLs (`imageUrls`); at least one photo is required.
- ✅ Live screens poll (`config.pollMs`): auction 3 s, chats 5 s, orders 15 s.
- ✅ ID photo uses the real camera (`features/auth/photoCapture.ts`, done in Phase 3).
- **Still open (needs accounts/decisions):** push notifications (Firebase project + Apple Push
  key; endpoints proposed in `docs/API.md` → Live Updates), real Google / Apple sign-in (Google
  Cloud OAuth client IDs, Apple Developer account), the payment provider SDK (§8 #4),
  won-auction checkout (after the server closes auctions).

### Phase 8 — Quality (in progress)
- ✅ Unit tests (pricing, filters, formatters, stores, brands, places, clock), component tests
  for the UI kit.
- ✅ E2E flows with Maestro (2026-10-20, `.maestro/`, `npm run e2e`, see `.maestro/README.md`):
  guest browse; buy → escrow → courier PIN confirms; sell with photo + brand/model. 3/3 pass.
  They found a real bug (My Listings didn't refresh after publishing; fixed).
- ✅ Crash reporting hooks (`ErrorBoundary`, `services/crashReporter.ts`; Sentry plugs in later).
- ✅ Performance pass (2026-10-20):
  - One shared clock (`hooks/useNow.ts`): countdowns redraw only their text (`TimeLeft`);
    cards redraw only when their auction ends. Before, whole screens redrew every second.
  - Result grids on FlashList (recycled cells), memoised cards.
  - Polling pauses in the background (React Query `focusManager` + AppState), refreshes on return.
  - Android release: R8 + resource shrinking on (release APK verified on the emulator).
  - Backend asked for ~400 px card thumbnails (`imageUrl`), full size only on the product page.
- Still to do: accessibility pass with TalkBack, iOS E2E run (needs a Mac or cloud runner).

### Phase 9 — Release
- ✅ Logo and app icons (2026-10-20): `assets/logo/sahla-mark.svg` (winking bag + price tag),
  `SahlaLogo` / `SahlaMark` in `src/components/SahlaLogo.tsx`, Android adaptive + legacy icons,
  iOS AppIcon set, `assets/logo/play-store-icon-512.png`. Still to do: splash screen, app name
  in Arabic and English.
- Android: release keystore, signed AAB, Google Play listing.
- iOS: bundle ID, signing, TestFlight, App Store listing.
- Privacy policy (ID documents and payment data are sensitive).

---

## 6. Development Environment

> **Windows release builds:** the native build fails with "Filename longer than 260 characters"
> because the SDK's CMake 3.22.1 ships an old `ninja`. Fix (this machine already has it): add
> `cmake.dir=C\:\Users\<you>\AppData\Local\Android\Sdk\cmake\4.1.2` to
> `android/local.properties` (git-ignored; CMake 4.1.2 from SDK Manager → SDK Tools).
> Windows "long paths" must also be on (it is here).

### 6.1 Common (Windows / macOS)

| Tool | Version | Status on this machine |
|---|---|---|
| Node.js | ≥ 22.11 (project `engines`) | ✅ v24.20.0 |
| npm | bundled with Node | ✅ 11.19.0 |
| Git | any recent | ✅ |
| VS Code (recommended) | latest | — |

### 6.2 Android (works on Windows)

| Tool | Notes | Status |
|---|---|---|
| **JDK** | Android Studio's bundled JDK (OpenJDK 25), compatible with the project's Gradle 9.4.1. The separately installed Java 8 is a JRE and too old; it is not used. | ✅ `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr` |
| **Android Studio** | Includes SDK Manager and emulator | ✅ Installed (2026.2.1) |
| Android SDK | Install via Studio's first-run Setup Wizard to the default location | ✅ Installed |
| SDK Platform **37** (`compileSdkVersion`), Build-Tools **37.0.0**, NDK **27.1.12297006** | SDK Manager → SDK Platforms / SDK Tools ("Show Package Details") | ✅ Installed |
| Platform-Tools, Emulator, Command-line Tools | SDK Manager → SDK Tools | ✅ Installed |
| `ANDROID_HOME` env var | `C:\Users\mustafa\AppData\Local\Android\Sdk`; `platform-tools` and `emulator` on PATH | ✅ Set |
| An emulator (AVD) or a phone with USB debugging | Device Manager → create a Pixel device with a recent system image | ✅ `Medium_Phone_API_37.0` |

Verify with: `npx react-native doctor`. On this machine it reports **Android SDK ✖ "Versions found: N/A"**;
this is a false alarm (the app builds and installs fine). Doctor can't read the SDK through `sdkmanager`
on Windows, so it never sees the installed Build-Tools.

Daily run:
1. Start the emulator from Android Studio's Device Manager (don't open the project in Android Studio).
2. VS Code terminal tab 1: `npm start` (Metro, the JS server). Wait for "Dev server ready".
3. VS Code terminal tab 2: `npm run android -- --active-arch-only` (builds only the emulator's CPU
   type: much faster and lighter on memory than all four). If it asks **"Use port 8082 instead?"
   answer No**: a Windows path bug in the CLI makes it think our own Metro is another project's.
   After changing `babel.config.js`, `metro.config.js` or `tailwind.config.js`, restart Metro with
   `npm start -- --reset-cache`.
4. If the app asks to access **nearby devices**, tap **Allow**. On Android 17 this is the local-network
   permission, and without it the app can't reach Metro.

If the app shows "Unable to load script": check Metro is running, then open the dev menu
(`d` in the Metro terminal) → *Change Bundle Location* → `10.0.2.2:8081`. On this machine
`adb reverse` doesn't forward to Metro, so the app is pointed at `10.0.2.2` (the emulator's
address for the PC). Reinstalling or clearing the app's data resets this.

### 6.3 iOS

iOS apps can only be compiled on macOS (Xcode). **Decision: no Mac — iOS is built with a cloud
build service.** Recommended: **EAS Build** (works with bare React Native projects via
`eas-cli`); Codemagic is the fallback.

How it works:
1. All development and daily testing happen on **Windows + Android emulator**. React Native
   shares one codebase, so most issues show up on Android first.
2. The cloud service checks out the repo on its Macs, runs `pod install`, builds and signs the
   iOS app.
3. The build is uploaded to **TestFlight** and installed on a physical iPhone for testing.

**Decision: no paid Apple Developer account during development.** It is bought later (before
Phase 9 or when TestFlight / push notifications are needed). Until then, iOS is tested with:

| Method | How | Use for | Limits |
|---|---|---|---|
| **Cloud simulator build + Appetize.io** (main) | Cloud service builds an iOS *Simulator* build (no signing, no Apple account) → upload to Appetize.io → runs in the browser | End-of-phase checks: layout, RTL, fonts, navigation | Free tier has limited minutes; no camera, push or real performance |
| **Unsigned IPA + Sideloadly + free Apple ID** | Cloud service builds an unsigned `.ipa` → Sideloadly signs it with a free Apple ID and installs over USB | Hardware features on a real iPhone (camera for ID verification, image picker) | App expires after 7 days, max 3 apps; no push notifications or Sign in with Apple. Use a separate Apple ID for this |

Until the paid account exists, step 3 above (TestFlight) is replaced by these two methods.

What's needed now:
- An account on the build service (`npm install -g eas-cli`, then `eas build:configure`),
  with a **simulator** build profile (`"ios": { "simulator": true }`).
- An Appetize.io account (free tier).
- Optional: an iPhone + Sideloadly for device testing.
- `ios/Podfile.lock` committed to git so cloud builds are reproducible.

What's needed later (paid account, $99/year): TestFlight, push notifications, external testers,
App Store release.

Rules because we can't run iOS locally:
- After adding **any native dependency**, run an iOS cloud build to confirm it compiles.
- Run an iOS build at the end of **every phase** at minimum.
- Avoid platform-specific code unless needed; when needed, use `Platform.select` and note it in the PR.

---

## 7. Dependencies

The project is already on **React Native 0.88 / React 19.3** (bare CLI, not Expo).
Install each package at the latest version that supports RN 0.88; check each library's
compatibility table before upgrading React Native.

### 7.1 Already installed

| Package | Purpose |
|---|---|
| `react`, `react-native` | Core |
| `react-native-safe-area-context` | Notch / status bar insets |
| TypeScript, ESLint, Prettier, Jest, Babel, Metro | Tooling (from the template) |

The template-only `@react-native/new-app-screen` was removed in Phase 1.

### 7.2 Installed in Phase 1

| Package | Version | Purpose |
|---|---|---|
| `@react-navigation/native` | 7.5 | Navigation core |
| `@react-navigation/native-stack` | 7.21 | Stack screens (product, checkout, …) |
| `@react-navigation/bottom-tabs` | 7.21 | Bottom nav |
| `react-native-screens` | 4.30 | Native screen containers (required by React Navigation) |
| `react-native-gesture-handler` | 3.4 | Gestures (swipe back, sheets, drawer) |
| `react-native-reanimated` + `react-native-worklets` | 4.7 + 0.13 | Animations (press scale, sidebar, toasts). Supports RN 0.86–0.88 |
| `nativewind` + `tailwindcss` | 4.2.7 + **3.4.x** | Tailwind-style classes, mirrors the prototype. NativeWind 4 needs Tailwind **3** (the prototype's Tailwind 4 `@theme` is re-expressed in `tailwind.config.js`). NativeWind 5 is still a release candidate |
| `react-native-svg` | 15.16 | Line icons |
| `i18next`, `react-i18next` | 26.5, 17.1 | Arabic / English strings |
| `react-native-restart` | 0.0.29 | Reload after switching RTL ↔ LTR |
| `zustand` | 5.0 | Global client state |
| `react-native-mmkv` + `react-native-nitro-modules` | 4.3 + 0.37 | Persistent storage (favourites, language, session) |
| `@tanstack/react-query` | 5.104 | Server state / caching |

Added in Phase 3:

| Package | Version | Purpose |
|---|---|---|
| `react-hook-form` | 7.90 | Forms |
| `zod` | 4.6 | Validation schemas (messages are i18n keys) |
| `@hookform/resolvers` | **5.x** | Zod ↔ React Hook Form. v6.0.0 has a broken optional-peer tree (npm `ERESOLVE`); stay on 5 until fixed |
| `@babel/plugin-transform-export-namespace-from` (dev) | 7.29 | Zod 4 uses `export * as`, which the RN Babel preset doesn't compile. After changing `babel.config.js`, restart Metro with `--reset-cache` |

Not installed (changed from the original plan):
- `react-native-localize`: not needed, since the app always opens in English (§8 decision 2).
- `@gorhom/bottom-sheet`: not needed; the Phase 2 sheets use `Modal` + Reanimated.

On macOS / cloud iOS builds: `cd ios && pod install`.

### 7.3 Needed in later phases

| Package | Phase | Purpose |
|---|---|---|
| `react-hook-form`, `zod`, `@hookform/resolvers` | 3–6 | Forms + validation |
| `react-native-image-picker` | 3–4 | Listing photos, ID upload |
| `react-native-vision-camera` | 3 (optional) | Live camera for ID capture |
| `@shopify/flash-list` | 2 | Fast product grids |
| `@d11/react-native-fast-image` (or similar) | 2 | Cached remote images |
| `axios` (or built-in `fetch`) | 7 | HTTP client |
| Real-time client (`socket.io-client` or provider SDK) | 5 | Chat + live bids |
| Payment provider SDK | 6 | Card tokenization (**provider to be chosen** — must support Jordan/JOD) |
| `@react-native-firebase/messaging` or `@notifee/react-native` | 7 | Push notifications |
| `react-native-keychain` | 3 | Secure token storage |
| `react-native-bootsplash` | 9 | Splash screen |
| Crash reporting (`@sentry/react-native`) | 8 | Error monitoring |

### 7.4 Dev / testing

| Package | Purpose |
|---|---|
| `@testing-library/react-native` | Component tests |
| `babel-plugin-module-resolver` | `@/` path alias |
| Maestro (CLI, not npm) | End-to-end tests on emulator/device |

---

## 8. Open Decisions

| # | Question | Needed by |
|---|---|---|
| ~~1~~ | ~~Palette~~ → **Decided:** sage green / brick red / warm cream (§2.1) | ✅ |
| ~~2~~ | ~~Default language~~ → **Decided:** English on first launch; user can switch to Arabic in Profile / sidebar, and the choice is saved | ✅ |
| 3 | Backend: custom API (Node/NestJS, Laravel, …) or BaaS (Firebase, Supabase)? | Phase 3 |
| 4 | Payment provider with Jordan / JOD support and escrow-style holds | Phase 6 |
| 5 | ID verification: manual review or a KYC provider? | Phase 3 |
| ~~6~~ | ~~iOS build path~~ → **Decided:** cloud build service, EAS Build; testing via Appetize.io / Sideloadly until a paid Apple account is bought (§6.3) | ✅ |
| 8 | When to buy the Apple Developer account ($99/year) | Before push notifications (Phase 7) or release (Phase 9) |
| 7 | Courier app: same app with a courier role, or a separate app? | Phase 6: **same app, `role: 'courier'`** for now; can be split out later |

---

## 9. Definition of Done (per screen)

- [ ] Visually matches the Figma Make prototype.
- [ ] Works in **Arabic (RTL)** and **English (LTR)**.
- [ ] Only theme tokens and i18n keys; no hard-coded colors or strings.
- [ ] Loading, empty and error states handled.
- [ ] Auth gating correct for guests.
- [ ] Accessible labels and 44×44 touch targets.
- [ ] Tested on an Android emulator (and iOS when available).
- [ ] Lint and tests pass.
