// Whether a live connection has been down long enough to tell the person. Mobile networks blink:
// shorter gaps aren't worth a banner flickering on and off.

import { useEffect, useState } from 'react';

export const RECONNECTING_AFTER_MS = 3_000;

export function useReconnecting(connected: boolean, trying: boolean) {
  const [downForAWhile, setDownForAWhile] = useState(false);
  useEffect(() => {
    if (connected || !trying) return;
    const timer = setTimeout(
      () => setDownForAWhile(true),
      RECONNECTING_AFTER_MS,
    );
    return () => {
      clearTimeout(timer);
      setDownForAWhile(false);
    };
  }, [connected, trying]);
  return downForAWhile;
}
