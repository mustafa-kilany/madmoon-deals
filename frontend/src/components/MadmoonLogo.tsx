// The Madmoon Deals logo: the letter م (the first letter of مضمون, "guaranteed") in
// cream on a dark brown tile, with a green line and a red dot.
// Same artwork as assets/logo/madmoon-mark.svg, which the app icons are rendered
// from; keep the two in sync.

import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/theme/colors';

// The letter م from Cairo Black, drawn in a 120 square.
const MEEM =
  'M51.86 86L38.09 86Q37.36 81.77 36.75 77.61Q36.14 73.46 36.14 70.12L36.14 70.12Q36.14 63.12 38.99 57.94Q41.84 52.77 47.05 49.92Q52.26 47.07 59.19 47.07L59.19 47.07Q60.41 47.07 61.59 47.07Q62.77 47.07 64.52 47.07Q66.27 47.07 68.75 47.07Q71.24 47.07 74.98 47.07L74.98 47.07L69.85 52.12L69.85 38.69Q69.85 35.51 69.20 33.60Q68.55 31.68 66.60 30.79Q64.64 29.89 60.73 29.89L60.73 29.89Q57.88 29.89 54.75 30.30Q51.61 30.70 49.82 31.44L49.82 31.44L58.62 23.46Q58.13 25.41 57.68 28.26Q57.23 31.11 56.99 34.08Q56.74 37.06 56.74 39.42L56.74 39.42Q56.74 42.02 56.99 44.91Q57.23 47.81 57.60 50.09Q57.96 52.37 58.13 53.18L58.13 53.18L44.77 56.85Q44.45 55.62 43.92 53.02Q43.39 50.41 43.06 46.95Q42.74 43.49 42.74 39.58L42.74 39.58Q42.74 35.59 43.14 31.84Q43.55 28.10 44.12 25.04Q44.69 21.99 45.18 20.20L45.18 20.20Q47.46 19.30 51.82 18.65Q56.17 18 61.06 18L61.06 18Q67.17 18 71.24 19.22Q75.31 20.44 77.83 22.56Q80.36 24.68 81.66 27.32Q82.97 29.97 83.41 32.94Q83.86 35.92 83.86 38.85L83.86 38.85L83.86 58.96Q80.11 58.96 76.29 58.96Q72.46 58.96 68.96 58.96Q65.46 58.96 62.89 58.96Q60.33 58.96 59.19 58.96L59.19 58.96Q57.88 58.96 56.34 59.33Q54.79 59.70 53.36 60.80Q51.94 61.89 51.04 64.13Q50.15 66.37 50.15 70.12L50.15 70.12Q50.15 72.97 50.68 76.84Q51.20 80.71 51.86 86L51.86 86Z';

export function MadmoonMark({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Rect width={120} height={120} rx={26} fill={colors.espresso} />
      <Path d={MEEM} fill={colors.lightgray} />
      <Rect x={24} y={94} width={58} height={8} fill={colors.primary} />
      <Circle cx={92} cy={98} r={5} fill={colors.secondary} />
    </Svg>
  );
}

/** Mark + "مضمون ديلز / MADMOON DEALS" wordmark, for the sign-in screen and the side menu. */
export function MadmoonLogo({ size = 72 }: { size?: number }) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('common.appName')}
      className="flex-row items-center gap-3"
    >
      <MadmoonMark size={size} />
      <View className="items-center">
        <Text
          className="font-heading-black text-brand-espresso"
          style={{ fontSize: size * 0.36, lineHeight: size * 0.52 }}
        >
          مضمون ديلز
        </Text>
        <Text
          className="font-heading-bold text-brand-primary"
          style={{ fontSize: size * 0.14, letterSpacing: 2 }}
        >
          MADMOON DEALS
        </Text>
      </View>
    </View>
  );
}
