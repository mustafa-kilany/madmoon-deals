// App text. Defaults to IBM Plex Sans Arabic Regular in espresso, like the
// prototype's body text; any font-sans-*/font-heading-* or text-brand-* class
// replaces the default. Use this instead of React Native's Text everywhere.

import { Text as RNText, type TextProps } from 'react-native';

const HAS_FAMILY = /(^|\s)font-(sans|heading)-/;
const HAS_COLOR = /(^|\s)text-brand-/;

export function Text({ className = '', ...props }: TextProps) {
  const family = HAS_FAMILY.test(className) ? '' : 'font-sans-regular';
  const color = HAS_COLOR.test(className) ? '' : 'text-brand-espresso';
  return <RNText className={`${family} ${color} ${className}`} {...props} />;
}

/** Screen and section titles: Cairo Black. Size comes from className (text-xl, text-sm, …). */
export function Heading({ className = '', ...props }: TextProps) {
  return (
    <Text
      accessibilityRole="header"
      className={`font-heading-black ${className}`}
      {...props}
    />
  );
}
