/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { applyDirection } from './src/i18n';
import { crashReporter } from './src/services/crashReporter';
import { useSettingsStore } from './src/store/settingsStore';

// NativeWind 4 registers className support on every core component, which
// reads the deprecated ImageBackground export. Not from our code; dev-only.
LogBox.ignoreLogs(['ImageBackground is deprecated']);

// Uncaught JS errors are reported (src/services/crashReporter.ts).
crashReporter.installGlobalHandler();

// Match the layout direction to the saved language before the first render
// (restarts once if they differ, e.g. on an Arabic-language device).
applyDirection(useSettingsStore.getState().lang);

AppRegistry.registerComponent(appName, () => App);
