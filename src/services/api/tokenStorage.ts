// Where the signed-in session token lives. Everything reads and writes it
// through this module, so moving it to the device keychain later
// (react-native-keychain, before release) is a change to this file only.

import { storage } from '@/lib/storage';

const KEY = 'auth.token';

export const tokenStorage = {
  get: (): string | undefined => storage.getString(KEY),
  set: (token: string): void => storage.set(KEY, token),
  clear: (): void => {
    storage.remove(KEY);
  },
};
