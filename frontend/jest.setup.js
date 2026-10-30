/* eslint-env jest */
// Test doubles for native modules.

// MMKV needs native code; tests get an in-memory store with the same API.
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => {
    const data = new Map();
    return {
      set: (key, value) => data.set(key, value),
      getString: key => {
        const value = data.get(key);
        return typeof value === 'string' ? value : undefined;
      },
      contains: key => data.has(key),
      remove: key => data.delete(key),
      clearAll: () => data.clear(),
      getAllKeys: () => [...data.keys()],
    };
  },
}));

// Keychain: an in-memory credential per service.
jest.mock('react-native-keychain', () => {
  const saved = new Map();
  return {
    ACCESSIBLE: {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
    },
    setGenericPassword: async (username, password, { service } = {}) => {
      saved.set(service, { username, password, service });
      return { service };
    },
    getGenericPassword: async ({ service } = {}) => saved.get(service) ?? false,
    resetGenericPassword: async ({ service } = {}) => saved.delete(service),
  };
});

// Reanimated (sheet animations): its official test double.
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

// Switching to Arabic restarts the app for RTL layout; tests just carry on.
jest.mock('react-native-restart', () => ({
  __esModule: true,
  default: { restart: jest.fn() },
}));

// Geolocation is native; the GPS → address logic is tested without it.
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {
    setRNConfiguration: jest.fn(),
    requestAuthorization: jest.fn(),
    getCurrentPosition: jest.fn(),
  },
}));
