// The signed-in person's live connection: while the app is in front, the server says at once when
// a chat or the support conversation changes, and the app fetches it. One for the whole app.
// `useLiveAccountStatus` lets screens poll slowly when it's up and warn when it has been down.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { config } from '@/config';
import { useUser } from '@/features/auth/sessionStore';
import { useReconnecting } from '@/hooks/useReconnecting';
import { tokenStorage } from '@/services/api/tokenStorage';
import {
  applyAccountEvent,
  connectLiveAccount,
} from '@/services/negotiation/live';
import { queryClient } from '@/services/queryClient';

const useLiveAccountStore = create(() => ({
  connected: false,
  reconnecting: false,
}));

export const useLiveAccountStatus = () => useLiveAccountStore();

/** React Native's WebSocket takes headers as a third argument; the standard one doesn't know it. */
type NativeWebSocket = new (
  url: string,
  protocols: undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

const liveUrl = `${config.apiBaseUrl.replace(/^http/, 'ws')}/me/live`;

/** Mounted once, in App.tsx. */
export function useLiveAccount() {
  const userId = useUser()?.id;
  const [connected, setConnected] = useState(false);
  const [trying, setTrying] = useState(false);
  const reconnecting = useReconnecting(connected, trying);

  useEffect(() => {
    useLiveAccountStore.setState({ connected, reconnecting });
  }, [connected, reconnecting]);

  useEffect(() => {
    if (!userId || config.mock.negotiation) return;
    let disconnect: (() => void) | undefined;

    const start = () => {
      setTrying(true);
      disconnect ??= connectLiveAccount(
        () =>
          new (WebSocket as unknown as NativeWebSocket)(liveUrl, undefined, {
            headers: { Authorization: `Bearer ${tokenStorage.get() ?? ''}` },
          }),
        {
          onEvent: event => applyAccountEvent(queryClient, event),
          onUp: () => {
            setConnected(true);
            // Anything that happened before this connection opened.
            applyAccountEvent(queryClient, { type: 'chat', chatId: '' });
            applyAccountEvent(queryClient, { type: 'support' });
          },
          onDown: () => setConnected(false),
        },
      );
    };
    const stop = () => {
      disconnect?.();
      disconnect = undefined;
      setConnected(false);
      setTrying(false);
    };

    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', state =>
      state === 'active' ? start() : stop(),
    );
    return () => {
      subscription.remove();
      stop();
    };
  }, [userId]);
}
