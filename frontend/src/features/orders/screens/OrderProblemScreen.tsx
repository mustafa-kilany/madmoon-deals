// Pick a reason (BACKEND_PLAN B15.3–B15.4), one screen for three cases:
// - the buyer cancels an order before the driver picks it up;
// - the buyer, at the door, reports a problem with the item instead of the PIN;
// - the driver marks a delivery failed, at the pickup or at the drop-off.
// The reason lists are shared with the server (lib/deliveryProblems.ts);
// "Another reason" needs a few words.

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
import {
  useCancelOrder,
  useReportItemIssue,
} from '@/features/checkout/hooks/useOrders';
import { useMarkFailed } from '@/features/courier/hooks/useDeliveries';
import { useLocalized } from '@/i18n';
import {
  CANCEL_REASONS,
  failReasonsFor,
  ITEM_ISSUE_REASONS,
  needsNote,
  NOTE_MAX,
  reasonLabel,
  type CancelReason,
  type FailReason,
  type ItemIssueReason,
} from '@/lib/deliveryProblems';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';

const NOTE_MIN = 3;

export function OrderProblemScreen({
  route,
  navigation,
}: RootScreenProps<'OrderProblem'>) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const params = route.params;
  const cancel = useCancelOrder();
  const issue = useReportItemIssue();
  const failed = useMarkFailed();
  const [reason, setReason] = useState<string>();
  const [note, setNote] = useState('');

  const copy =
    params.kind === 'deliveryFailed'
      ? ({
          title: 'problem.failedTitle',
          why:
            params.stage === 'pickup'
              ? 'problem.failedWhyPickup'
              : 'problem.failedWhyDropoff',
          submit: 'problem.failedSubmit',
          done: 'problem.failedDone',
          reasons: failReasonsFor(params.stage) as readonly string[],
        } as const)
      : params.kind === 'cancel'
      ? ({
          title: 'problem.cancelTitle',
          why: 'problem.cancelWhy',
          submit: 'problem.cancelSubmit',
          done: 'problem.cancelDone',
          reasons: CANCEL_REASONS as readonly string[],
        } as const)
      : ({
          title: 'problem.issueTitle',
          why: 'problem.issueWhy',
          submit: 'problem.issueSubmit',
          done: 'problem.issueDone',
          reasons: ITEM_ISSUE_REASONS as readonly string[],
        } as const);

  const noteNeeded = !!reason && needsNote(reason);
  const ready = !!reason && (!noteNeeded || note.trim().length >= NOTE_MIN);
  const pending = cancel.isPending || issue.isPending || failed.isPending;

  const callbacks = {
    onSuccess: () => {
      toast.success(t(copy.done));
      navigation.goBack();
    },
    onError: (error: unknown) => toast.error(t(errorMessageKey(error))),
  };

  const send = () => {
    if (!reason || !ready) return;
    const input = {
      orderId: params.orderId,
      note: note.trim() || undefined,
    };
    if (params.kind === 'cancel')
      cancel.mutate({ ...input, reason: reason as CancelReason }, callbacks);
    else if (params.kind === 'itemIssue')
      issue.mutate({ ...input, reason: reason as ItemIssueReason }, callbacks);
    else failed.mutate({ ...input, reason: reason as FailReason }, callbacks);
  };

  return (
    <Screen
      tone="white"
      headerBorder
      header={
        <>
          <BackButton />
          <Heading className="text-xl">{t(copy.title)}</Heading>
        </>
      }
    >
      <ScrollView
        contentContainerClassName="gap-5 p-5"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-xs text-brand-warmgray">{params.orderId}</Text>
        <Text className="font-sans-bold text-sm">{t(copy.why)}</Text>
        <View className="gap-2">
          {copy.reasons.map(r => (
            <Chip
              key={r}
              testID={`reason-${r}`}
              label={localized(reasonLabel(r))}
              selected={reason === r}
              onPress={() => setReason(r)}
            />
          ))}
        </View>
        <TextField
          label={t(noteNeeded ? 'problem.note' : 'problem.noteOptional')}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={NOTE_MAX}
          style={styles.multiline}
          error={
            noteNeeded && note.trim().length < NOTE_MIN
              ? t('problem.noteNeeded')
              : undefined
          }
        />
        <Button
          size="lg"
          label={t(copy.submit)}
          disabled={!ready}
          loading={pending}
          onPress={send}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
