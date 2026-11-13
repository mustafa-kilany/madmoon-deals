// The Sahla logo: a winking shopping bag with a price tag (سهلة = "easy").
// Same artwork as assets/logo/sahla-mark.svg, which the app icons are rendered
// from; keep the two in sync.

import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/theme/colors';

type SahlaMarkProps = {
  size?: number;
  /** The two sparkles: pale yellow on the green icon, green on cream screens. */
  sparkle?: string;
};

export function SahlaMark({
  size = 64,
  sparkle = colors.primary,
}: SahlaMarkProps) {
  const ink = colors.espresso;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <G
        transform="translate(-3 2)"
        stroke={ink}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path
          d="M42 44 V36 Q42 19 58 19 Q74 19 74 36 V44"
          fill="none"
          strokeWidth={6}
        />
        <Path
          d="M27 42 H89 Q96 42 97 49 L101 99 Q102 109 92 109 H24 Q14 109 15 99 L19 49 Q20 42 27 42 Z"
          fill={colors.lightgray}
          strokeWidth={5}
        />
        <Path d="M20.5 52 H95.5" fill="none" strokeWidth={3} opacity={0.18} />
        <Path d="M74 46 Q94 42 104.9 69.3" fill="none" strokeWidth={3} />
        <Path
          d="M42 80 Q58 100 74 80 Q58 86 42 80 Z"
          fill={ink}
          strokeWidth={3}
        />
        <Path d="M65 65 Q70.5 59 76 65" fill="none" strokeWidth={4} />
        <G transform="translate(103 76) rotate(16)">
          <Path
            d="M-11 -6 L0 -17 L11 -6 V15 Q11 19 7 19 H-7 Q-11 19 -11 15 Z"
            fill={colors.secondary}
            strokeWidth={4}
          />
          <Circle cx={0} cy={-7} r={3} fill={colors.lightgray} stroke="none" />
        </G>
        <G stroke="none">
          <Ellipse cx={45} cy={64} rx={4.5} ry={6.5} fill={ink} />
          <Circle cx={46.5} cy={61.5} r={1.6} fill={colors.surface} />
          <Ellipse
            cx={34}
            cy={78}
            rx={5.5}
            ry={3.2}
            fill={colors.secondary}
            opacity={0.35}
          />
          <Ellipse
            cx={82}
            cy={78}
            rx={5.5}
            ry={3.2}
            fill={colors.secondary}
            opacity={0.35}
          />
        </G>
      </G>
      <Path
        d="M16 10 Q17 17 24 18 Q17 19 16 26 Q15 19 8 18 Q15 17 16 10 Z"
        fill={sparkle}
      />
      <Path
        d="M98 10 Q98.8 14.5 103 15 Q98.8 15.5 98 20 Q97.2 15.5 93 15 Q97.2 14.5 98 10 Z"
        fill={sparkle}
      />
    </Svg>
  );
}

/** Mark + "سهلة / SAHLA" wordmark, for the sign-in screen and the side menu. */
export function SahlaLogo({ size = 72 }: { size?: number }) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('common.appName')}
      className="flex-row items-center gap-1"
    >
      <SahlaMark size={size} />
      <View className="items-center">
        <Text
          className="font-heading-black text-brand-espresso"
          style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}
        >
          سهلة
        </Text>
        <Text
          className="font-heading-bold text-brand-primary"
          style={{ fontSize: size * 0.17, letterSpacing: 2 }}
        >
          SAHLA
        </Text>
      </View>
    </View>
  );
}
