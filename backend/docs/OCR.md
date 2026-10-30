# Certificate OCR: providers and plan

Sellers of phones and electronics must upload a **shop test certificate**: a stamped paper from a
phone/electronics shop that names the device and its specs. Publish stays blocked until it passes
(`POST /test-certificates` → `testCertificateId` on `POST /listings`; rules in
[`docs/API.md`](../../docs/API.md#shop-test-certificates-phones--electronics)).

The server needs three things from the photo:

1. **The text** (Arabic + English, printed and handwritten): shop name and phone, device, specs, date.
2. **Where each word is**, to blur IMEI / serial numbers before buyers see the photo.
3. **Is there a stamp?** OCR can't answer this; it is a separate image check.

## OCR providers

| Provider | Arabic | Word positions (for blurring) | Price (check current pricing) | Fit for Sahla |
|---|---|---|---|---|
| **Google Cloud Vision**, `DOCUMENT_TEXT_DETECTION` | ✅ printed and handwritten | ✅ per word | First 1,000 images/month free, then about $1.50 per 1,000 | **Recommended start.** Simple REST call with an API key; already written in `src/modules/certificates/ocr.ts` |
| Google Document AI (Enterprise Document OCR) | ✅ | ✅ | Similar per-page price | Better on complex layouts; more setup (processors, a GCP project). Upgrade path if Vision struggles |
| Azure AI Vision **Read** / Document Intelligence | ✅ printed (test handwriting on your own samples) | ✅ | Similar per-page price | A good second choice; same shape of result |
| AWS Textract | ❌ **no Arabic** | ✅ | n/a | **Not suitable** |
| Claude (vision model), e.g. `claude-opus-5-5` | ✅ reads messy photos and handwriting well | ❌ no word positions | $4 / $20 per million input / output tokens: a few cents per photo | Not the OCR itself, but a strong **second opinion**: one call can return shop, phone, date, device, specs **and "is there a stamp?"** as JSON |
| Tesseract (free, self-hosted) | ⚠️ weak on Arabic photos | ✅ | Free | Not good enough for phone photos of paper |
| Open models (e.g. Qwen2.5-VL Arabic fine-tunes) | ✅ | Varies | Your own GPU server | Only worth it at very high volume |

**Plan:** Google Vision reads the text and the word positions. The rule checks in
`src/modules/certificates/checks.ts` decide pass or fail (already written and tested). Claude can be
added later for the stamp and for hard cases.

## The stamp, in three phases

1. **Now (no detector):** text checks decide pass or fail. Every certificate is saved with
   `stampChecked = false` and shows up in an admin review list. Admins reject fakes, which removes the
   listing. This also **collects labelled training photos** for free.
2. **Next:** add a stamp check to `src/modules/certificates/stamp.ts`, either
   - Claude vision with a yes/no question ("Is there an ink stamp of a shop on this paper? Answer
     with JSON `{ stamp: boolean, shopNameOnStamp?: string }`"), or
   - a small image classifier (Vertex AI AutoML or Azure Custom Vision) trained on the photos admins
     reviewed in phase 1. A few hundred stamped and unstamped photos is enough to start.
3. **Later:** a list of **trusted shops** (name + phone). Reports from known shops pass faster;
   shops whose reports keep getting rejected are blocked.

## Setting up Google Vision (when you're ready)

1. Go to https://console.cloud.google.com, create a project (e.g. "sahla"), and turn on **billing**.
   The free tier still needs a card.
2. **APIs & Services → Library →** search **"Cloud Vision API" → Enable**.
3. **APIs & Services → Credentials → Create credentials → API key.** Click the key → **API
   restrictions → Restrict key → Cloud Vision API** only.
4. Put it in `backend/.env`: `GOOGLE_VISION_API_KEY=...`
5. Set a **budget alert** (Billing → Budgets), e.g. 10 USD/month, so a bug can't run up a bill.

## Built (BACKEND_PLAN B4)

- `POST /test-certificates` (`src/modules/certificates/service.ts`): the photo is turned upright and
  stripped of EXIF → `ocr.read()` → `stamp.detect()` → `checkCertificateText()` → step 7 (same photo
  fingerprint or same IMEI / serial hash on a listing that isn't withdrawn → `already_used`) → a
  `TestCertificate` row. The original goes to `uploads-private` (never served).
- Blurred copy for buyers (`photo.ts`): the boxes of the words that make up an IMEI / serial are blurred.
- No key in development: a fake reader (`fakeOcr.ts`) "reads" a passing report for the chosen device.
  In production without a key the endpoint answers 503.
- `POST /listings` refuses a `requiresTestCertificate` type without a passed, unused certificate for the
  same type / brand / model (B4.5).
