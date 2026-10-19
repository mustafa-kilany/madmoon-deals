// Providers + navigation shell. Everything else lives under src/ (see
// DEVELOPMENT_GUIDE.md §4.1).

import './global.css';
import '@/i18n';
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SidebarMenu } from '@/components/SidebarMenu';
import { Toast } from '@/components/Toast';
import { navigationRef } from '@/navigation/navigationRef';
import { RootNavigator } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

const queryClient = new QueryClient();

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
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar barStyle="dark-content" />
          <NavigationContainer ref={navigationRef} theme={navigationTheme}>
            <RootNavigator />
            <SidebarMenu />
            <Toast />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

export default App;
