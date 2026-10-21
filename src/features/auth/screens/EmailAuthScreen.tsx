// Email sign-up & log-in with OTP verification support.

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { Button, Heading, Screen, Text, TextField } from '@/components/ui';
import { config } from '@/config';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';
import {
  useLogInWithEmail,
  useSendOtp,
  useSignUpWithEmail,
  useVerifyOtp,
} from '../hooks/useAccount';
import { useFieldError } from '../hooks/useFieldError';

const logInSchema = z.object({
  name: z.string(),
  email: z.string().trim().email('validation.emailInvalid'),
  password: z.string().min(1, 'validation.passwordRequired'),
});

const signUpSchema = logInSchema.extend({
  name: z.string().trim().min(2, 'validation.nameRequired'),
  password: z.string().min(8, 'validation.passwordShort'),
});

type FormValues = z.infer<typeof logInSchema>;

export function EmailAuthScreen({ route }: RootScreenProps<'EmailAuth'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const fieldError = useFieldError();

  const [mode, setMode] = useState<'signup' | 'login'>(
    route.params?.mode ?? 'signup',
  );
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [otpCode, setOtpCode] = useState('');

  const signUp = useSignUpWithEmail();
  const logIn = useLogInWithEmail();
  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();

  const isSignUp = mode === 'signup';

  const { control, handleSubmit, formState, clearErrors, getValues } =
    useForm<FormValues>({
      resolver: zodResolver(isSignUp ? signUpSchema : logInSchema),
      defaultValues: { name: '', email: '', password: '' },
    });
  const { errors } = formState;

  const handleCredentialsSubmit = handleSubmit(values => {
    if (isSignUp) {
      // Request OTP code to be sent to the email
      sendOtp.mutate(
        { email: values.email },
        {
          onSuccess: () => {
            setStep('otp');
            toast.info(t('auth.otpSentTo', { email: values.email }));
          },
          onError: err => {
            // If OTP endpoint fails, fallback to direct signUp
            signUp.mutate(values);
          },
        },
      );
    } else {
      logIn.mutate({ email: values.email, password: values.password });
    }
  });

  const handleVerifyOtpSubmit = () => {
    const email = getValues('email');
    if (!otpCode || otpCode.trim().length < 4) {
      toast.error(t('validation.passwordRequired'));
      return;
    }

    verifyOtp.mutate(
      { email, code: otpCode.trim() },
      {
        onError: () => {
          // Fallback to complete signup mutation with initial values
          signUp.mutate(getValues());
        },
      },
    );
  };

  const switchMode = () => {
    clearErrors();
    setStep('credentials');
    setOtpCode('');
    signUp.reset();
    logIn.reset();
    sendOtp.reset();
    verifyOtp.reset();
    setMode(isSignUp ? 'login' : 'signup');
  };

  const activeMutation =
    step === 'otp'
      ? verifyOtp.isPending
        ? verifyOtp
        : signUp
      : isSignUp
      ? sendOtp.isPending
        ? sendOtp
        : signUp
      : logIn;

  return (
    <Screen
      tone="white"
      headerBorder
      header={
        <>
          <BackButton
            onPress={step === 'otp' ? () => setStep('credentials') : undefined}
          />
          <Heading className="text-xl">
            {t(
              step === 'otp'
                ? 'auth.enterOtp'
                : isSignUp
                ? 'screens.emailSignUp'
                : 'screens.emailLogIn',
            )}
          </Heading>
        </>
      }
    >
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 p-6"
          keyboardShouldPersistTaps="handled"
        >
          {step === 'credentials' ? (
            <>
              {isSignUp && (
                <Controller
                  control={control}
                  name="name"
                  render={({ field }) => (
                    <TextField
                      variant="form"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      placeholder={t('auth.fullName')}
                      accessibilityLabel={t('auth.fullName')}
                      autoComplete="name"
                      textContentType="name"
                      error={fieldError(errors.name)}
                    />
                  )}
                />
              )}
              <Controller
                control={control}
                name="email"
                render={({ field }) => (
                  <TextField
                    variant="form"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={t('auth.email')}
                    accessibilityLabel={t('auth.email')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    ltr
                    error={fieldError(errors.email)}
                  />
                )}
              />
              <Controller
                control={control}
                name="password"
                render={({ field }) => (
                  <TextField
                    variant="form"
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder={t('auth.password')}
                    accessibilityLabel={t('auth.password')}
                    secureTextEntry
                    autoComplete={
                      isSignUp ? 'new-password' : 'current-password'
                    }
                    textContentType={isSignUp ? 'newPassword' : 'password'}
                    onSubmitEditing={() => handleCredentialsSubmit()}
                    error={fieldError(errors.password)}
                  />
                )}
              />

              {isSignUp && (
                <View className="flex-row items-center gap-2 rounded-xl bg-brand-lightgray p-3">
                  <Icon name="IdCard" size={20} color={colors.warmgray} />
                  <Text className="flex-1 font-sans-bold text-xs text-brand-warmgray">
                    {t('auth.emailUnverifiedNote')}
                  </Text>
                </View>
              )}

              <Pressable
                onPress={switchMode}
                accessibilityRole="button"
                className="min-h-11 justify-center self-center"
              >
                <Text className="font-sans-bold text-sm text-brand-primary">
                  {t(isSignUp ? 'auth.haveAccount' : 'auth.noAccount')}
                </Text>
              </Pressable>

              {!isSignUp && config.mock.auth && (
                <Text className="text-center text-xs text-brand-warmgray">
                  {t('auth.demoHint')}
                </Text>
              )}
            </>
          ) : (
            <View className="gap-5 pt-4">
              <View className="items-center gap-2">
                <Heading className="text-2xl">{t('auth.enterOtp')}</Heading>
                <Text className="text-center font-sans-medium text-sm text-brand-warmgray">
                  {t('auth.otpSentTo', { email: getValues('email') })}
                </Text>
              </View>

              <TextField
                variant="form"
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                ltr
                onSubmitEditing={handleVerifyOtpSubmit}
              />

              <Pressable
                onPress={() =>
                  sendOtp.mutate(
                    { email: getValues('email') },
                    {
                      onSuccess: () =>
                        toast.info(
                          t('auth.otpSentTo', { email: getValues('email') }),
                        ),
                    },
                  )
                }
                accessibilityRole="button"
                className="min-h-11 justify-center self-center"
              >
                <Text className="font-sans-bold text-sm text-brand-primary">
                  {t('auth.resendOtp')}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        <View
          className="gap-3 border-t border-brand-border p-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          {activeMutation.isError && (
            <Text
              accessibilityRole="alert"
              className="text-center font-sans-bold text-sm text-brand-danger"
            >
              {t(errorMessageKey(activeMutation.error))}
            </Text>
          )}
          <Button
            size="lg"
            label={t(
              step === 'otp'
                ? 'auth.verifyAndSignIn'
                : isSignUp
                ? 'auth.createAccount'
                : 'auth.logIn',
            )}
            loading={activeMutation.isPending}
            onPress={
              step === 'otp'
                ? handleVerifyOtpSubmit
                : () => handleCredentialsSubmit()
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
