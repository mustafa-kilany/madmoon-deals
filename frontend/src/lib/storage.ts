// App-wide key/value storage (MMKV: synchronous, so persisted stores are
// ready before the first render). `zustandStorage` plugs it into zustand's
// `persist` middleware.

import { createMMKV } from 'react-native-mmkv';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

export const storage = createMMKV({ id: 'sahla' });

const stateStorage: StateStorage = {
  getItem: key => storage.getString(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => {
    storage.remove(key);
  },
};

export const zustandStorage = createJSONStorage(() => stateStorage);
