// A price as the prototype shows it: Cairo Black amount, smaller unit after it
// ("780 JOD" / "780 د.أ"). The amount always reads left-to-right.

import { Text as RNText } from 'react-native';
import { Ltr, Text } from '@/components/ui';
import { useLang } from '@/i18n';
import { currencyLabel, formatAmount } from '@/lib/money';

type PriceProps = {
  fils: number;
  /** Size and color of the whole price (text-lg text-brand-primary, …). */
  className?: string;
  /** Size of the currency unit (text-xs, text-[10px], …). */
  unitClassName?: string;
};

export function Price({
  fils,
  className = '',
  unitClassName = 'text-xs',
}: PriceProps) {
  const lang = useLang();
  return (
    <Text className={`font-heading-black ${className}`}>
      <Ltr>{formatAmount(fils)}</Ltr>{' '}
      {/* RN Text so it inherits the font and color above. */}
      <RNText className={unitClassName}>{currencyLabel(lang)}</RNText>
    </Text>
  );
}
