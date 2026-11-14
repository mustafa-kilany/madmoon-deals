// The seller's bank account (SECURITY_PLAN S3.7): where Madmoon Deals sends the money after delivery. A change
// needs the password (or an emailed code, for Google / Apple accounts), and holds payouts
// for 24 hours. Only the last 4 characters ever come back from the server. The screen is
// kept out of screenshots while it's open.

import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { StatusView } from '@/components/StatusView';
import { Button, Card, Heading, Ltr, Screen, Text, TextField } from '@/components/ui';
import {
  usePayoutAccount,
  useSavePayoutAccount,
  useSendPayoutCode,
} from '@/features/auth/hooks/useAccount';
import { isJordanIban, maskedIban, normalizeIban } from '@/lib/iban';
import { useSecureScreen } from '@/lib/secureScreen';
import { ApiError, errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';

export function PayoutAccountScreen() {
  const { t, i18n } = useTranslation();
  useSecureScreen();
  const { data, isLoading, isError, refetch } = usePayoutAccount();
  const save = useSavePayoutAccount();
  const sendCode = useSendPayoutCode();
  const [editing, setEditing] = useState(false);
  const [holderName, setHolderName] = useState('');
  const [iban, setIban] = useState('');
  const [secret, setSecret] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  // No account yet: straight to the form.
  useEffect(() => {
    if (data && !data.account) setEditing(true);
  }, [data]);

  const usesCode = data?.confirmWith === 'code';
  const normalized = normalizeIban(iban);
  const ibanOk = isJordanIban(normalized);
  const nameOk = holderName.trim().length >= 3;
  const ready = ibanOk && nameOk && (usesCode ? /^\d{6}$/.test(secret) : secret.length > 0);

  const onSave = () =>
    save.mutate(
      {
        holderName: holderName.trim(),
        iban: normalized,
        ...(usesCode ? { code: secret } : { password: secret }),
      },
      {
        onSuccess: () => {
          setEditing(false);
          setHolderName('');
          setIban('');
          setSecret('');
          setCodeSent(false);
          toast.success(t('payout.saved'));
        },
        onError: error => {
          const wrongPassword = error instanceof ApiError && error.code === 'INVALID_CREDENTIALS';
          toast.error(wrongPassword ? t('payout.wrongPassword') : t(errorMessageKey(error)));
          setSecret('');
        },
      },
    );

  const heldUntil = data?.account?.heldUntil;

  return (
    <Screen
      tone="white"
      headerBorder
      header={
        <>
          <BackButton />
          <Heading className="text-xl">{t('payout.title')}</Heading>
        </>
      }
    >
      {isLoading ? (
        <StatusView status="loading" />
      ) : isError || !data ? (
        <StatusView status="error" onRetry={refetch} />
      ) : (
        <ScrollView contentContainerClassName="gap-5 p-5" keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-brand-warmgray">{t('payout.why')}</Text>

          {data.account && (
            <Card testID="payout-current" className="gap-1 p-4">
              <Text className="font-sans-bold">{data.account.holderName}</Text>
              <Ltr testID="payout-iban" className="text-sm">
                {maskedIban(data.account.ibanLast4)}
              </Ltr>
              {heldUntil && (
                <Text testID="payout-held" className="pt-2 text-xs text-brand-danger">
                  {t('payout.held', { date: new Date(heldUntil).toLocaleString(i18n.language) })}
                </Text>
              )}
            </Card>
          )}

          {!editing ? (
            <Button
              variant="secondary"
              testID="payout-change"
              label={t('payout.change')}
              onPress={() => setEditing(true)}
            />
          ) : (
            <View className="gap-4">
              {data.account && <Text className="text-sm text-brand-danger">{t('payout.changeWarning')}</Text>}
              <TextField
                testID="payout-holder"
                label={t('payout.holder')}
                value={holderName}
                onChangeText={setHolderName}
                maxLength={100}
                autoCapitalize="words"
              />
              <TextField
                testID="payout-iban-input"
                label={t('payout.iban')}
                placeholder="JO94 CBJO 0010 0000 0000 0131 0003 02"
                value={iban}
                onChangeText={setIban}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={40}
                error={iban.length > 0 && !ibanOk ? t('payout.ibanInvalid') : undefined}
              />
              {usesCode ? (
                <>
                  <Button
                    variant="secondary"
                    testID="payout-send-code"
                    label={t(codeSent ? 'payout.codeSent' : 'payout.sendCode')}
                    loading={sendCode.isPending}
                    onPress={() =>
                      sendCode.mutate(undefined, {
                        onSuccess: () => setCodeSent(true),
                        onError: error => toast.error(t(errorMessageKey(error))),
                      })
                    }
                  />
                  <TextField
                    testID="payout-code"
                    label={t('payout.code')}
                    value={secret}
                    onChangeText={setSecret}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </>
              ) : (
                <TextField
                  testID="payout-password"
                  label={t('payout.password')}
                  value={secret}
                  onChangeText={setSecret}
                  secureTextEntry
                  autoCapitalize="none"
                />
              )}
              <Button
                size="lg"
                testID="payout-save"
                label={t('payout.save')}
                disabled={!ready}
                loading={save.isPending}
                onPress={onSave}
              />
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
