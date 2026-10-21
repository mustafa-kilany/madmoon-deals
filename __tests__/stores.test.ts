// On-device state: favourites, history, toasts and the signed-in session.

import { useHistoryStore } from '@/features/catalog/historyStore';
import { useFavoritesStore } from '@/features/favorites/store';
import { restoreSession, useSessionStore } from '@/features/auth/sessionStore';
import { storage } from '@/lib/storage';
import type { User } from '@/lib/types';
import { tokenStorage } from '@/services/api/tokenStorage';
import { toast, useToastStore } from '@/store/toastStore';

const user: User = {
  id: 'u1',
  name: 'Ahmad',
  method: 'email',
  verified: false,
  cityId: 'salt',
  avatarUrl: 'https://cdn.test/a.jpg',
};

describe('favourites', () => {
  beforeEach(() => useFavoritesStore.setState({ ids: [] }));

  test('toggle saves (newest first) and unsaves', () => {
    const { toggle } = useFavoritesStore.getState();
    expect(toggle('a')).toBe(true);
    expect(toggle('b')).toBe(true);
    expect(useFavoritesStore.getState().ids).toEqual(['b', 'a']);
    expect(toggle('a')).toBe(false);
    expect(useFavoritesStore.getState().ids).toEqual(['b']);
  });

  test('kept on the device', () => {
    useFavoritesStore.getState().toggle('mobiles-1');
    expect(storage.getString('favorites')).toContain('mobiles-1');
  });
});

describe('history', () => {
  beforeEach(() =>
    useHistoryStore.setState({ recentItemIds: [], recentSearches: [] }),
  );

  test('recently viewed: newest first, no duplicates, at most 8', () => {
    const { addRecentItem } = useHistoryStore.getState();
    for (let i = 0; i < 10; i++) addRecentItem(`item-${i}`);
    addRecentItem('item-5');
    const ids = useHistoryStore.getState().recentItemIds;
    expect(ids).toHaveLength(8);
    expect(ids[0]).toBe('item-5');
    expect(ids.filter(id => id === 'item-5')).toHaveLength(1);
  });

  test('recent searches: trimmed, case-insensitive duplicates, blanks ignored, at most 6', () => {
    const { addRecentSearch } = useHistoryStore.getState();
    addRecentSearch('  iPhone ');
    addRecentSearch('   ');
    addRecentSearch('IPHONE');
    expect(useHistoryStore.getState().recentSearches).toEqual(['IPHONE']);
    for (let i = 0; i < 8; i++) addRecentSearch(`q${i}`);
    expect(useHistoryStore.getState().recentSearches).toHaveLength(6);
  });
});

describe('toasts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => jest.useRealTimers());

  test('show with a tone, then dismiss themselves', () => {
    toast.error('Wrong PIN');
    toast.success('Saved');
    expect(useToastStore.getState().toasts.map(t => t.tone)).toEqual([
      'error',
      'success',
    ]);
    jest.advanceTimersByTime(2600);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});

describe('session', () => {
  beforeEach(() => {
    tokenStorage.clear();
    useSessionStore.setState({ user: null });
  });

  test('sign in keeps the token; sign out forgets user and token', () => {
    useSessionStore.getState().signIn({ token: 'tok', user });
    expect(useSessionStore.getState().user).toEqual(user);
    expect(tokenStorage.get()).toBe('tok');
    useSessionStore.getState().signOut();
    expect(useSessionStore.getState().user).toBeNull();
    expect(tokenStorage.get()).toBeUndefined();
  });

  test('launch: a saved user without a token is a guest', async () => {
    useSessionStore.setState({ user });
    await restoreSession();
    expect(useSessionStore.getState().user).toBeNull();
  });

  test('launch: the token comes back from the keychain', async () => {
    useSessionStore.getState().signIn({ token: 'kept', user });
    await new Promise<void>(resolve => setTimeout(resolve, 0)); // keychain write
    await restoreSession();
    expect(tokenStorage.get()).toBe('kept');
    expect(useSessionStore.getState().user).toEqual(user);
  });

  test('launch: a token from an older build (plain storage) moves to the keychain', async () => {
    storage.set('auth.token', 'legacy');
    await restoreSession();
    expect(tokenStorage.get()).toBe('legacy');
    expect(storage.getString('auth.token')).toBeUndefined();
  });
});
