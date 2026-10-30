// Tailwind (NativeWind) config. Colors and fonts come from src/theme so the
// class names match the Figma prototype: bg-brand-primary, text-brand-on-primary, …
const { colors } = require('./src/theme/colors');
const { fontFamilies } = require('./src/theme/typography');

const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: Object.fromEntries(
          Object.entries(colors).map(([name, hex]) => [kebab(name), hex]),
        ),
      },
      // One family per weight (React Native can't pick weights from one family
      // reliably on Android): font-heading-black, font-sans-bold, …
      fontFamily: Object.fromEntries(
        Object.entries(fontFamilies).map(([name, family]) => [
          kebab(name),
          [family],
        ]),
      ),
    },
  },
  plugins: [],
};
