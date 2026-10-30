// Layout numbers for code that can't use Tailwind classes (e.g. navigator
// options, animated styles). In JSX prefer the classes noted beside each value.

export const spacing = {
  screenX: 20, // px-5
  gap: 12, // gap-3
  gapLg: 16, // gap-4
} as const;

export const radius = {
  control: 12, // rounded-xl: inputs, buttons
  card: 16, // rounded-2xl
} as const;

export const iconSize = {
  inline: 16,
  list: 20,
  nav: 24,
} as const;
