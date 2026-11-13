// Where the signed-in session token lives: the device keychain (iOS
// Keychain / Android Keystore), never plain storage. Reading the keychain is
// async, so the app calls `load()` once at launch (App.tsx) and every request
// reads the copy in memory.

import * as Keychain from 'react-native-keychain';
import { storage } from '@/lib/storage';

const SERVICE = 'jo.sahla.session';
/** Builds before Phase 7 kept the token in MMKV; moved on first launch. */
const LEGACY_KEY = 'auth.token';

let token: string | undefined;

const save = (value: string) =>
  Keychain.setGenericPassword('session', value, {
    service: SERVICE,
    // Not in backups, not readable while the phone is locked.
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }).catch(() => false);

export const tokenStorage = {
  /** Read the saved token into memory. Call once before the app renders. */
  load: async (): Promise<void> => {
    const legacy = storage.getString(LEGACY_KEY);
    if (legacy) {
      token = legacy;
      await save(legacy);
      storage.remove(LEGACY_KEY);
      return;
    }
    const saved = await Keychain.getGenericPassword({ service: SERVICE }).catch(
      () => false as const,
    );
    token = saved ? saved.password : undefined;
  },
  get: (): string | undefined => token,
  set: (value: string): void => {
    token = value;
    save(value);
  },
  clear: (): void => {
    token = undefined;
    Keychain.resetGenericPassword({ service: SERVICE }).catch(() => false);
  },
};
