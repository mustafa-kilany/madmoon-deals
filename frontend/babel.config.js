module.exports = {
  // nativewind/babel also adds the Reanimated (Worklets) plugin, so it isn't
  // listed again under plugins.
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  plugins: [
    // Zod 4 uses `export * as ns from`, which the RN preset doesn't compile.
    '@babel/plugin-transform-export-namespace-from',
    [
      'module-resolver',
      {
        extensions: [
          '.ios.js',
          '.android.js',
          '.js',
          '.jsx',
          '.ts',
          '.tsx',
          '.json',
        ],
        alias: {
          '@': './src',
        },
      },
    ],
  ],
};
