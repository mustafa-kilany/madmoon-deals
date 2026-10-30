const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

module.exports = withNativeWind(
  mergeConfig(getDefaultConfig(__dirname), config),
  {
    input: './global.css',
    // The prototype is web Tailwind (1rem = 16px); NativeWind defaults to 14.
    inlineRem: 16,
  },
);
