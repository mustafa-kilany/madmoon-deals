// Numbers, prices, card numbers and PINs always read left-to-right, even in
// Arabic. Android ignores `writingDirection`, so the value is wrapped in Unicode
// directional isolates (LRI … PDI), which both platforms respect.
//
//   <Text>{t('checkout.total')}: {ltr(formatJOD(total, lang))}</Text>
//   <Ltr className="font-heading-black text-2xl">4829</Ltr>

import { Text as RNText, StyleSheet, type TextProps } from 'react-native';

const LRI = '⁦';
const PDI = '⁩';

export const ltr = (value: string | number): string => `${LRI}${value}${PDI}`;

/**
 * Inline LTR run. Built on React Native's Text (not ui/Text) so that, nested
 * inside other text, it inherits the surrounding font and color.
 */
export function Ltr({ children, style, ...props }: TextProps) {
  const content =
    typeof children === 'string' || typeof children === 'number'
      ? ltr(children)
      : children;
  return (
    <RNText style={[styles.ltr, style]} {...props}>
      {content}
    </RNText>
  );
}

const styles = StyleSheet.create({ ltr: { writingDirection: 'ltr' } });
