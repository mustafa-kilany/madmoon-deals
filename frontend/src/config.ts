// App-wide settings. Connecting the real backend is done here: set
// `apiBaseUrl`, then switch each service in `mock` to false as the API ships
// it (see docs/API.md for the contract). No screen code changes.
//
// To try the app against the local contract server (tools/contract-server):
//   apiBaseUrl: 'http://10.0.2.2:4000/v1'  (Android emulator → this PC)
//   mock: { auth: false, … }

export const config = {
  /**
   * Base URL of the Madmoon Deals REST API. Debug builds use the local contract
   * server; release builds the real API (address from the backend developer).
   */
  apiBaseUrl: __DEV__ ? 'http://10.0.2.2:4000/v1' : 'https://api.sahla.jo/v1',
  /**
   * Google sign-in: the WEB OAuth client id of Firebase project
   * sahla-project-75cb2 (client_type 3 in android/app/google-services.json).
   * Not a secret. The backend lists the same id in GOOGLE_CLIENT_IDS.
   */
  googleWebClientId:
    '480175471997-c87tff478kbuv6qia35a5ui5pfis3lvo.apps.googleusercontent.com',
  /** true = that service answers from the in-app mock backend (src/services/mock). */
  // B15.10: everything on the real backend (the seed's fake items, PAYMENT_MODE=fake).
  mock: {
    catalog: false,
    auth: false,
    negotiation: false,
    orders: false,
    /**
     * The courier's deliveries. Real: couriers log in with the real auth, and
     * admins assign orders to them in the dashboard.
     */
    courier: false,
  },
  /**
   * This build's number, sent as X-App-Build on every request: the server answers a build older
   * than its MIN_APP_BUILD with "update Madmoon Deals" (BACKEND_REVIEW M3). Always the same as versionCode
   * in android/app/build.gradle: raise both together (__tests__/appBuild.test.ts checks).
   */
  appBuild: 1,
  /** Fake network delay for mock calls, so loading states are visible in dev. */
  mockLatencyMs: __DEV__ ? 400 : 0,
  /** Requests slower than this fail with a NETWORK error. Uploads get longer. */
  requestTimeoutMs: 15_000,
  uploadTimeoutMs: 60_000,
  /**
   * Live screens re-ask the server this often while they're open (and stop
   * when the app is in the background). Auctions, chats and support hear of
   * changes at once over live connections; these polls are the safety net behind them.
   */
  pollMs: {
    auction: 3_000, // current bid + bid list, when the live connection is down
    auctionLive: 15_000, // the same, with the live connection up
    chat: 5_000, // threads and open conversation, when the live connection is down
    chatLive: 30_000, // the same with it up; also the unread badge on every tab
    orders: 15_000, // order status (courier delivered → completed)
    deliveries: 30_000, // the courier's list (newly assigned orders)
  },
} as const;
