// Asks the buyer, before the phone's own permission dialog, whether to fill
// the delivery address from their location. Shown when checkout opens with
// no saved address.

import { Modal, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icons';
import { Button, Heading, Text } from '@/components/ui';
import { colors } from '@/theme/colors';

type LocationPromptProps = {
  visible: boolean;
  locating: boolean;
  onUseLocation: () => void;
  /** Type it instead (also the back button). */
  onSkip: () => void;
};

export function LocationPrompt({
  visible,
  locating,
  onUseLocation,
  onSkip,
}: LocationPromptProps) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onSkip}
    >
      <View className="flex-1 items-center justify-center bg-brand-espresso/60 p-6">
        <View
          accessibilityViewIsModal
          className="w-full max-w-sm gap-4 rounded-3xl bg-brand-surface p-6"
        >
          <View className="h-14 w-14 items-center justify-center self-center rounded-full bg-brand-success-soft">
            <Icon name="MapPin" size={28} color={colors.primary} />
          </View>
          <Heading className="text-center text-xl">
            {t('checkout.locationPrompt.title')}
          </Heading>
          <Text className="text-center font-sans-medium text-sm leading-relaxed text-brand-warmgray">
            {t('checkout.locationPrompt.body')}
          </Text>
          <Button
            label={t('checkout.locationPrompt.use')}
            icon="MapPin"
            loading={locating}
            onPress={onUseLocation}
          />
          <Button
            variant="secondary"
            label={t('checkout.locationPrompt.skip')}
            onPress={onSkip}
          />
        </View>
      </View>
    </Modal>
  );
}
