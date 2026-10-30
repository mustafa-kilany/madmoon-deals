// The approved palette (sage green / brick red / warm cream), copied from the
// Figma prototype's index.css. This is the only place hex values live: Tailwind
// exposes each one as `brand-<kebab-name>` (bg-brand-primary,
// text-brand-on-primary, …) and code that needs a raw value (SVG icons,
// navigation theme) imports `colors`.

export const colors = {
  primary: '#7D9C65',
  onPrimary: '#FFFFFF',
  secondary: '#B93636',
  espresso: '#2C1E16',
  warmgray: '#78716C',
  lightgray: '#FFFDF4',
  surface: '#FFFFFF',
  muted: '#FFF2A0',
  border: '#EAE6DF',
  success: '#7D9C65',
  successSoft: '#F1F4ED',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  warningText: '#92400E',
  warningSoft: '#FEF3C7',
} as const;

export type ColorName = keyof typeof colors;
