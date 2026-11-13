// SECURITY_PLAN S6.5: useSecureScreen() keeps the screen out of screenshots, recordings and the
// app switcher while it's focused. Android only for now (ScreenSecurityModule.kt); on iPhone the
// native side is added with the iOS build, and until then this does nothing.

import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { NativeModules } from 'react-native';

const setSecure = (secure: boolean) => NativeModules.ScreenSecurity?.setSecure?.(secure);

export function useSecureScreen(active = true) {
  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;
      setSecure(true);
      return () => setSecure(false);
    }, [active]),
  );
}
