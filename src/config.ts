// App-wide settings. Connecting the real backend (Phase 7) is done here:
// set `apiBaseUrl`, flip `useMockApi` to false, and every service switches
// from the in-app mock backend to HTTP calls (see docs/API.md for the contract).

export const config = {
  /** Base URL of the Sahla REST API. Placeholder until the backend exists. */
  apiBaseUrl: 'https://api.sahla.example/v1',
  /** true: services answer from the in-app mock backend (src/services/mock). */
  useMockApi: true,
  /** Fake network delay for mock calls, so loading states are visible in dev. */
  mockLatencyMs: __DEV__ ? 400 : 0,
  /** Requests slower than this fail with a NETWORK error. */
  requestTimeoutMs: 15_000,
} as const;
