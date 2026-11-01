// App-wide settings. Connecting the real backend is done here: set
// `apiBaseUrl`, then switch each service in `mock` to false as the API ships
// it (see docs/API.md for the contract). No screen code changes.
//
// To try the app against the local contract server (tools/contract-server):
//   apiBaseUrl: 'http://10.0.2.2:4000/v1'  (Android emulator → this PC)
//   mock: { auth: false, … }

export const config = {
  /**
   * Base URL of the Sahla REST API. Debug builds use the local contract
   * server; release builds the real API (address from the backend developer).
   */
  apiBaseUrl: __DEV__ ? 'http://10.0.2.2:4000/v1' : 'https://api.sahla.jo/v1',
  /** true = that service answers from the in-app mock backend (src/services/mock). */
  mock: {
    catalog: true,
    auth: false,
    negotiation: true,
    orders: true,
    /**
     * The courier's deliveries. Real: couriers log in with the real auth, and
     * admins assign orders to them in the dashboard.
     */
    courier: false,
  },
  /** Fake network delay for mock calls, so loading states are visible in dev. */
  mockLatencyMs: __DEV__ ? 400 : 0,
  /** Requests slower than this fail with a NETWORK error. Uploads get longer. */
  requestTimeoutMs: 15_000,
  uploadTimeoutMs: 60_000,
  /**
   * Live screens re-ask the server this often while they're open (and stop
   * when the app is in the background). A WebSocket / push can replace this
   * later without touching the screens.
   */
  pollMs: {
    auction: 3_000, // current bid + bid list
    chat: 5_000, // threads and open conversation
    orders: 15_000, // order status (courier delivered → completed)
    deliveries: 30_000, // the courier's list (newly assigned orders)
  },
} as const;
