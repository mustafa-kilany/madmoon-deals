// Report a listing or a user to the Sahla team (App Store guideline 1.2:
// apps with user content must let people report it). Pick a reason, add
// optional details, send. The team reviews reports within 24 hours.

import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import {
  Button,
  Chip,
  Heading,
  Screen,
  Text,
  TextField,
} from '@/components/ui';
import { useReport } from '@/features/offers/hooks/useNegotiation';
import type { ReportReason } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';

const REASONS: ReportReason[] = [
  'scam',
  'prohibited',
  'offensive',
  'wrong_info',
  'other',
];
const DETAILS_MAX = 500;

export function ReportScreen({ route, navigation }: RootScreenProps<'Report'>) {
  const { t } = useTranslation();
  const target = route.params;
  const report = useReport();
  const [reason, setReason] = useState<ReportReason>();
  const [details, setDetails] = useState('');

  const send = () =>
    reason &&
    report.mutate(
      { target, reason, details: details.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('report.thanks'));
          navigation.goBack();
        },
        onError: error => toast.error(t(errorMessageKey(error))),
      },
    );

  return (
    <Screen
      tone="white"
      headerBorder
      header={
        <>
          <BackButton />
          <Heading className="text-xl">
            {t(
              target.type === 'listing'
                ? 'report.listingTitle'
                : 'report.userTitle',
            )}
          </Heading>
        </>
      }
    >
      <ScrollView
        contentContainerClassName="gap-5 p-5"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-sans-bold text-sm">{t('report.why')}</Text>
        <View className="gap-2">
          {REASONS.map(r => (
            <Chip
              key={r}
              label={t(`report.${r}`)}
              selected={reason === r}
              onPress={() => setReason(r)}
            />
          ))}
        </View>
        <TextField
          label={t('report.details')}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={DETAILS_MAX}
          style={styles.multiline}
        />
        <Button
          size="lg"
          icon="Flag"
          label={t('report.submit')}
          disabled={!reason}
          loading={report.isPending}
          onPress={send}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
