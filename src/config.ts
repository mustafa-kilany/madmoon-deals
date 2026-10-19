// App-wide settings. Connecting the real backend is done here: set
// `apiBaseUrl`, then switch each service in `mock` to false as the API ships
// it (see docs/API.md for the contract). No screen code changes.
//
// To try the app against the local contract server (tools/contract-server):
//   apiBaseUrl: 'http://10.0.2.2:4000/v1'  (Android emulator → this PC)
//   mock: { auth: false, … }

export const config = {
  /** Base URL of the Sahla REST API. Placeholder until the backend exists. */
  apiBaseUrl: 'http://10.0.2.2:4000/v1',
  /** true = that service answers from the in-app mock backend (src/services/mock). */
  mock: {
    catalog: true,
    auth: false,
  },
  /** Fake network delay for mock calls, so loading states are visible in dev. */
  mockLatencyMs: __DEV__ ? 400 : 0,
  /** Requests slower than this fail with a NETWORK error. Uploads get longer. */
  requestTimeoutMs: 15_000,
  uploadTimeoutMs: 60_000,
} as const;
