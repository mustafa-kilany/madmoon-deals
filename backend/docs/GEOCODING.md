# Street from GPS: Google Geocoding API

`GET /v1/geocode/reverse` (BACKEND_PLAN B7.1, decision D6 = **Google**) fills the checkout address when the
buyer taps "Use my location": the phone picks the area, the server asks Google for "street, neighbourhood"
in Arabic or English. Coordinates are never stored or logged; 20 lookups an hour per user.

Code: `src/modules/geocode/geocoder.ts` (`google`, `streetFromGoogle`). Settings in `backend/.env`:

```
GEOCODER=google
GOOGLE_MAPS_API_KEY=AIza...
```

The server refuses to start with `GEOCODER=google` and no key. Other values: `off`, `fake` (tests),
`nominatim` (free OpenStreetMap, for development).

## Cost

Google charges per lookup after a free monthly allowance (at the time of writing: 10 000 free a month, then
about 5 USD per 1 000; check <https://mapsplatform.google.com/pricing/>). One checkout = at most one lookup,
and each user is capped at 20 an hour, so the free allowance covers a lot of orders. A daily quota (step 5)
caps the bill even if something goes wrong.

## Setting it up (once)

Use the Google Cloud project Firebase already made (`sahla-project-75cb2`): one project for Firebase,
Google sign-in and maps.

1. **Open the project.** <https://console.cloud.google.com/> → project picker at the top → `sahla-project-75cb2`.
2. **Billing.** ☰ → *Billing* → link a billing account (add a card). Google needs it even for the free
   allowance. Firebase then shows the project on the *Blaze* plan; push notifications stay free.
3. **Turn on the API.** ☰ → *APIs & Services* → *Library* → search **Geocoding API** → *Enable*.
4. **Make the key.** *APIs & Services* → *Credentials* → *+ Create credentials* → *API key*. Then open the key
   (✏️) and:
   * **Name:** `Sahla backend geocoding`.
   * **API restrictions:** *Restrict key* → tick only **Geocoding API** → *Save*.
   * **Application restrictions:** *None* for now (your home IP changes). When the API is hosted (B12.2) and
     has a fixed outgoing IP, change it to *IP addresses* with that IP.
5. **Cap the use.** *APIs & Services* → *Geocoding API* → *Quotas & System Limits* → *Requests per day* →
   ✏️ → e.g. `1000` → *Submit*. Over the cap Google answers `OVER_QUERY_LIMIT` and buyers just get the area.
6. **Budget alert.** ☰ → *Billing* → *Budgets & alerts* → *Create budget*: e.g. 10 USD a month, email at
   50 %, 90 %, 100 %. (An alert only warns; the quota in step 5 is what stops lookups.)
7. **Put the key in `backend/.env`** (never in git, never in the app):
   ```
   GEOCODER=google
   GOOGLE_MAPS_API_KEY=AIza...the key...
   ```
   Restart the backend (`npm run dev`).
8. **Try it** (PowerShell, with a customer token from the app or `POST /v1/auth/login`):
   ```powershell
   $token = "..."
   Invoke-RestMethod "http://localhost:4000/v1/geocode/reverse?lat=31.9539&lng=35.9106&lang=ar" -Headers @{ Authorization = "Bearer $token" }
   Invoke-RestMethod "http://localhost:4000/v1/geocode/reverse?lat=31.9539&lng=35.9106&lang=en" -Headers @{ Authorization = "Bearer $token" }
   ```
   You should see `address` with a street and neighbourhood. In the app: checkout with no saved address →
   *Use my location*.

## When it doesn't work

The backend log shows one line, never the key or the coordinates:

| Log | Meaning | Fix |
|---|---|---|
| `Google Geocoding status REQUEST_DENIED` | Key wrong, API not enabled, billing off, or the key's restrictions don't allow this API / this server's IP | Steps 2–4 |
| `Google Geocoding status OVER_QUERY_LIMIT` | The daily quota (step 5) is used up | Raise it, or wait for tomorrow |
| `Google Geocoding answered 4xx/5xx` / timeout | Google or the network is down (4 s timeout) | Nothing; buyers get the area meanwhile |

`address: ""` with no log line means Google has no named street there (`ZERO_RESULTS` or only
"Unnamed Road"): normal outside towns.

## Production

* Same two settings on the host (B12.2), as secret environment variables.
* Restrict the key to the server's outgoing IP (step 4).
* A key that leaked: *Credentials* → the key → *Regenerate key*, put the new one in the host's settings.
