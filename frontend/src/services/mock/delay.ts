// Mock-backend helpers: simulated network latency and its own storage, kept
// apart from real app data so it can be wiped without touching settings.

import { createMMKV } from 'react-native-mmkv';
import { config } from '@/config';

export const mockLatency = () =>
  new Promise<void>(resolve => setTimeout(resolve, config.mockLatencyMs));

/** "Server-side" data of the mock backend (accounts, sessions). */
export const mockDb = createMMKV({ id: 'mock-backend' });

export function readMockTable<T>(name: string): Record<string, T> {
  const raw = mockDb.getString(name);
  return raw ? (JSON.parse(raw) as Record<string, T>) : {};
}

export function writeMockTable<T>(name: string, table: Record<string, T>) {
  mockDb.set(name, JSON.stringify(table));
}
