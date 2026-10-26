// Forgot password: enter the account's email → the server emails a 6-digit
// code → enter the code and a new password → signed in. The first step never
// says whether the email has an account (so it can't be used to find users).

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Button, Heading, Screen, Text, TextField } from '@/components/ui';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { useForgotPassword, useResetPassword } from '../hooks/useAccount';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ResetPasswordScreen({
  route,
}: RootScreenProps<'ResetPassword'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const forgot = useForgotPassword();
  const reset = useResetPassword();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const emailOk = EMAIL.test(email.trim());
  const codeOk = /^\d{6}$/.test(code.trim());
  const passwordOk = password.length >= 8;

  const sendCode = () =>
    forgot.mutate(
      { email: email.trim() },
      {
        onSuccess: () => {
          setStep('code');
          toast.info(t('auth.resetCodeSent', { email: email.trim() }));
        },
      },
    );

  const save = () =>
    reset.mutate({ email: email.trim(), code: code.trim(), password });

  const active = step === 'email' ? forgot : reset;

  return (
    <Screen
      tone="white"
      headerBorder
      header={
        <>
          <BackButton
            onPress={step === 'code' ? () => setStep('email') : undefined}
          />
          <Heading className="text-xl">{t('auth.forgotPassword')}</Heading>
        </>
      }
    >
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 p-6"
          keyboardShouldPersistTaps="handled"
        >
          {step === 'email' ? (
            <>
              <Text className="font-sans-medium text-sm text-brand-warmgray">
                {t('auth.resetBody')}
              </Text>
              <TextField
                variant="form"
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.email')}
                accessibilityLabel={t('auth.email')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                ltr
                onSubmitEditing={() => emailOk && sendCode()}
                error={
                  email && !emailOk ? t('validation.emailInvalid') : undefined
                }
              />
            </>
          ) : (
            <>
              <Text className="font-sans-medium text-sm text-brand-warmgray">
                {t('auth.otpSentTo', { email: email.trim() })}
              </Text>
              <TextField
                variant="form"
                value={code}
                onChangeText={setCode}
                placeholder={t('auth.otpCode')}
                accessibilityLabel={t('auth.otpCode')}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                ltr
              />
              <TextField
                variant="form"
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.newPassword')}
                accessibilityLabel={t('auth.newPassword')}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                onSubmitEditing={() => codeOk && passwordOk && save()}
                error={
                  password && !passwordOk
                    ? t('validation.passwordShort')
                    : undefined
                }
              />
              <Pressable
                onPress={sendCode}
                accessibilityRole="button"
                className="min-h-11 justify-center self-center"
              >
                <Text className="font-sans-bold text-sm text-brand-primary">
                  {t('auth.resendOtp')}
                </Text>
              </Pressable>
              {__DEV__ && (
                <Text className="text-center text-xs text-brand-warmgray">
                  {t('auth.demoCode')}
                </Text>
              )}
            </>
          )}
        </ScrollView>

        <View
          className="gap-3 border-t border-brand-border p-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          {active.isError && (
            <Text
              accessibilityRole="alert"
              className="text-center font-sans-bold text-sm text-brand-danger"
            >
              {t(errorMessageKey(active.error))}
            </Text>
          )}
          <Button
            size="lg"
            label={t(
              step === 'email' ? 'auth.sendCode' : 'auth.resetAndSignIn',
            )}
            disabled={step === 'email' ? !emailOk : !(codeOk && passwordOk)}
            loading={active.isPending}
            onPress={step === 'email' ? sendCode : save}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
