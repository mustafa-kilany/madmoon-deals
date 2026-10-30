module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // backend/ is a separate Node project with its own tests.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/backend/'],
  modulePathIgnorePatterns: ['<rootDir>/backend/'],
  // Reanimated / Worklets: resolve their JS (non-native) builds in tests.
  resolver: 'react-native-reanimated/jest/resolver',
  // Component tests render NativeWind (className) components, so its runtime
  // and every react-native-* package ship untranspiled code Jest must compile.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native[^/]*|@react-native[^/]*|@react-navigation|nativewind)/)',
  ],
};
