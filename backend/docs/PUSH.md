# Push notifications

Firebase Cloud Messaging (FCM) delivers Sahla's pushes to Android phones, and to iPhones once an Apple
push key is uploaded to Firebase. Firebase project: `sahla-project-75cb2`.

## What is sent (BACKEND_PLAN B9.3)

| Event | To | `data` (what a tap opens) |
|---|---|---|
| New chat message (a burst → one push) | the other person | `{ type: "chat", id: chatId }` |
| New offer / counter-offer / accepted / declined | the other side | `{ type: "offer", id: chatId }` |
| Outbid | the bidder who was on top | `{ type: "outbid", id: listingId }` |
| Auction won | the winner | `{ type: "auction_won", id: listingId }` |
| Delivered | the buyer | `{ type: "order", id: orderId }` |
| Delivered | the seller | `{ type: "sale", id: orderId }` |

- The title is the listing's title; the text is in the language the phone registered with (`ar` / `en`).
- **Never the text of a chat message**: phones show pushes on the lock screen.
- Sent a moment after the request (`src/lib/jobs.ts`), so a slow Firebase never slows the app.
- Code: `src/modules/notifications/notify.ts` (the events and texts), `push.ts` (the senders).

## Which phones

- The app registers its token with `POST /me/devices` after sign-in (and at every launch, which also
  updates the language). A phone belongs to the account last signed in on it.
- The token is tied to that sign-in: log-out, password reset, account deletion or an expired session
  stop the pushes.
- When Firebase says a token is gone (app uninstalled), the phone is removed.
- Suspended accounts get no pushes.

## Settings (`backend/.env`)

```
PUSH_MODE=fcm                                       # off | fake (tests) | fcm
FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json
```

`FIREBASE_SERVICE_ACCOUNT` is the path to the service account key, or the JSON itself (for hosting
without files). The key comes from Firebase console → ⚙️ Project settings → **Service accounts** →
**Generate new private key**. It is a secret: it's in `.gitignore`; never email or commit it. If it
leaks, delete that key in Google Cloud console → IAM → Service accounts → Keys, and make a new one.

The app side needs `frontend/android/app/google-services.json` (from the same Firebase project; not a
secret).

## iPhone (later)

Needs a Mac, an Apple Developer account, a real bundle id (the iOS project still has the template id),
and an APNs key (Apple Developer → Keys) uploaded to Firebase → Project settings → Cloud Messaging.
The server needs no change.
