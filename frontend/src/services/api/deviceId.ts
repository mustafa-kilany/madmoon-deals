// A random id for this phone, made once and kept in MMKV. Sent as X-Device-Id
// on every request (docs/API.md → Conventions): the server counts listing views
// per phone and spots many accounts made on one phone (the risk checker).
// It identifies the install, not the person, and says nothing about the device.

import { storage } from '@/lib/storage';

const KEY = 'deviceId';

const randomId = () =>
  Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0'),
  ).join('');

export function deviceId(): string {
  let id = storage.getString(KEY);
  if (!id) {
    id = randomId();
    storage.set(KEY, id);
  }
  return id;
}
