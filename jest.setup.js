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
