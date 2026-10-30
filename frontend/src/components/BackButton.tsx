// Direction-aware back button for screen headers: points left in English,
// right in Arabic. Defaults to going back to the previous screen (or tab),
// and to Home when there is nothing to go back to.

import { useNavigation } from '@react-navigation/native';
import { I18nManager, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { go } from '@/features/auth/authFlow';
import { iconSize } from '@/theme/spacing';

type BackButtonProps = {
  onPress?: () => void;
  /** "floating" = translucent white circle for headers over images. */
  variant?: 'default' | 'floating';
};

export function BackButton({ onPress, variant = 'default' }: BackButtonProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const back = () =>
    navigation.canGoBack()
      ? navigation.goBack()
      : go({ name: 'Tabs', params: { screen: 'Home' } });

  return (
    <Pressable
      onPress={onPress ?? back}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      hitSlop={4}
      className={
        variant === 'floating'
          ? 'rounded-full bg-brand-surface/80 p-2 shadow-sm'
          : '-ms-2 rounded-full p-2 active:bg-brand-muted'
      }
    >
      <Icon
        name={I18nManager.isRTL ? 'ChevronRight' : 'ChevronLeft'}
        size={iconSize.nav}
      />
    </Pressable>
  );
}
