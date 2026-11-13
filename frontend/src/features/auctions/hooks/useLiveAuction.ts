// Keeps an auction screen connected for new bids, only while it's the screen showing and the app is
// in front. `connected`: the screen polls slowly when it is, quickly when it isn't, so bids always
// show. `reconnecting`: it has been down long enough to tell the person their view may be old.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { config } from '@/config';
import { useReconnecting } from '@/hooks/useReconnecting';
import { connectLiveBids, applyLiveBid } from '@/services/negotiation/live';
import { queryClient, queryKeys } from '@/services/queryClient';

const liveUrl = (itemId: string) =>
  `${config.apiBaseUrl.replace(/^http/, 'ws')}/listings/${encodeURIComponent(itemId)}/live`;

export function useLiveAuction(itemId: string | undefined, isFocused: boolean) {
  const [connected, setConnected] = useState(false);
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    if (!itemId || !isFocused || config.mock.negotiation) return;
    let disconnect: (() => void) | undefined;

    const start = () => {
      setTrying(true);
      disconnect ??= connectLiveBids(liveUrl(itemId), {
        onBid: (bid, endsAt) => {
          applyLiveBid(queryClient, bid, endsAt).catch(() => {}); // the next poll has it anyway
        },
        onUp: () => {
          setConnected(true);
          // Anything that happened before this connection opened.
          queryClient.invalidateQueries({ queryKey: queryKeys.item(itemId) });
          queryClient.invalidateQueries({ queryKey: ['bids', itemId] });
        },
        onDown: () => setConnected(false),
      });
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
  }, [itemId, isFocused]);

  return { connected, reconnecting: useReconnecting(connected, trying) };
}
