// Providers + navigation shell. Everything else lives under src/ (see
// DEVELOPMENT_GUIDE.md §4.1).

import './global.css';
import '@/i18n';
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SidebarMenu } from '@/components/SidebarMenu';
import { Toast } from '@/components/Toast';
import { useSessionRefresh } from '@/features/auth/hooks/useAccount';
import { restoreSession } from '@/features/auth/sessionStore';
import { navigationRef } from '@/navigation/navigationRef';
import { RootNavigator } from '@/navigation/RootNavigator';
import { queryClient } from '@/services/queryClient';
import { colors } from '@/theme/colors';

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.lightgray,
    card: colors.surface,
    text: colors.espresso,
    border: colors.border,
  },
};

function App() {
  // The session token is read from the keychain before anything asks the API.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    restoreSession().finally(() => setReady(true));
  }, []);
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar barStyle="dark-content" />
          <NavigationContainer ref={navigationRef} theme={navigationTheme}>
            <SessionRefresh />
            <RootNavigator />
            <SidebarMenu />
            <Toast />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Re-reads the signed-in account from the server once at launch. */
function SessionRefresh() {
  useSessionRefresh();
  return null;
}

const styles = StyleSheet.create({ root: { flex: 1 } });

export default App;
