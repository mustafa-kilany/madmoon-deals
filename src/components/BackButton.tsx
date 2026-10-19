// Direction-aware back button for screen headers: points left in English,
// right in Arabic. Defaults to going back in the navigation stack.

import { useNavigation } from '@react-navigation/native';
import { I18nManager, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { iconSize } from '@/theme/spacing';

type BackButtonProps = {
  onPress?: () => void;
  /** "floating" = translucent white circle for headers over images. */
  variant?: 'default' | 'floating';
};

export function BackButton({ onPress, variant = 'default' }: BackButtonProps) {
  const { t } = useTranslation();
  const navigation = useNavigation();

  return (
    <Pressable
      onPress={onPress ?? (() => navigation.goBack())}
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
