// Email sign-up & log-in. Sign-up proves the email first: the server emails
// a 6-digit code (send-otp) and the account is created with it (signup).

import { isCommonPassword } from '@/lib/commonPasswords';
import { TermsNote } from '@/features/legal/TermsNote';
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
import { Icon, type IconName } from '@/components/icons';
import { MadmoonLogo } from '@/components/MadmoonLogo';
import { Button, Heading, Screen, Text, TextField } from '@/components/ui';
import { config } from '@/config';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';
import { go } from '../authFlow';
import {
  useLogInWithEmail,
  useSendOtp,
  useSignUpWithEmail,
} from '../hooks/useAccount';
import { useFieldError } from '../hooks/useFieldError';

const logInSchema = z.object({
  name: z.string(),
  email: z.string().trim().email('validation.emailInvalid'),
  password: z.string().min(1, 'validation.passwordRequired'),
});

const signUpSchema = logInSchema.extend({
  name: z.string().trim().min(2, 'validation.nameRequired'),
  password: z
    .string()
    .min(8, 'validation.passwordShort')
    .refine(p => !isCommonPassword(p), 'validation.passwordCommon'),
});

type FormValues = z.infer<typeof logInSchema>;

/** Footer reassurance: what an account on Madmoon Deals gets you. */
const TRUST = [
  { icon: 'Shield', label: 'product.buyerProtection' },
  { icon: 'Truck', label: 'product.delivery48h' },
  { icon: 'BadgeCheck', label: 'auth.verifiedSellers' },
] as const satisfies readonly { icon: IconName; label: string }[];

export function EmailAuthScreen({ route }: RootScreenProps<'EmailAuth'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const fieldError = useFieldError();

  const [mode, setMode] = useState<'signup' | 'login'>(
    route.params?.mode ?? 'login',
  );
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [otpCode, setOtpCode] = useState('');

  const signUp = useSignUpWithEmail();
  const logIn = useLogInWithEmail();
  const sendOtp = useSendOtp();

  const isSignUp = mode === 'signup';

  const { control, handleSubmit, formState, clearErrors, getValues } =
    useForm<FormValues>({
      resolver: zodResolver(isSignUp ? signUpSchema : logInSchema),
      defaultValues: { name: '', email: '', password: '' },
    });
  const { errors } = formState;

  const handleCredentialsSubmit = handleSubmit(values => {
    if (isSignUp) {
      sendOtp.mutate(
        { email: values.email },
        {
          onSuccess: () => {
            setStep('otp');
            toast.info(t('auth.otpSentTo', { email: values.email }));
          },
        },
      );
    } else {
      logIn.mutate({ email: values.email, password: values.password });
    }
  });

  const handleVerifyOtpSubmit = () => {
    if (!/^\d{6}$/.test(otpCode.trim())) {
      toast.error(t('validation.codeInvalid'));
      return;
    }
    signUp.mutate({ ...getValues(), code: otpCode.trim() });
  };

  const switchMode = () => {
    clearErrors();
    setStep('credentials');
    setOtpCode('');
    signUp.reset();
    logIn.reset();
    sendOtp.reset();
    setMode(isSignUp ? 'login' : 'signup');
  };

  const activeMutation = step === 'otp' ? signUp : isSignUp ? sendOtp : logIn;

  const title =
    step === 'otp'
      ? t('auth.enterOtp')
      : t(isSignUp ? 'auth.signUpTitle' : 'auth.logInTitle');
  const subtitle =
    step === 'otp'
      ? t('auth.otpSentTo', { email: getValues('email') })
      : t(isSignUp ? 'auth.signUpSubtitle' : 'auth.logInSubtitle');

  return (
    <Screen
      tone="white"
      header={
        <BackButton
          onPress={step === 'otp' ? () => setStep('credentials') : undefined}
        />
      }
    >
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow px-6"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 justify-center gap-6 pb-8">
            <View className="items-center gap-2">
              <View className="mb-2">
                <MadmoonLogo size={64} />
              </View>
              <Heading className="text-center text-3xl">{title}</Heading>
              <Text className="text-center font-sans-medium text-sm leading-relaxed text-brand-warmgray">
                {subtitle}
              </Text>
            </View>

            {step === 'credentials' ? (
              <View className="gap-4">
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
                        leading={
                          <Icon
                            name="Profile"
                            size={20}
                            color={colors.warmgray}
                          />
                        }
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
                      leading={
                        <Icon name="Mail" size={20} color={colors.warmgray} />
                      }
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
                      leading={
                        <Icon name="Lock" size={20} color={colors.warmgray} />
                      }
                      error={fieldError(errors.password)}
                    />
                  )}
                />

                {isSignUp ? (
                  <View className="flex-row items-center gap-2 rounded-xl bg-brand-lightgray p-3">
                    <Icon name="IdCard" size={20} color={colors.warmgray} />
                    <Text className="flex-1 font-sans-bold text-xs text-brand-warmgray">
                      {t('auth.emailUnverifiedNote')}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() =>
                      go({
                        name: 'ResetPassword',
                        params: { email: getValues('email').trim() },
                      })
                    }
                    accessibilityRole="button"
                    className="-mt-1 min-h-11 justify-center self-end"
                  >
                    <Text className="font-sans-bold text-sm text-brand-primary">
                      {t('auth.forgotPassword')}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View className="gap-2">
                <TextField
                  variant="form"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder="123456"
                  accessibilityLabel={t('auth.otpCode')}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
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

            <View className="gap-3">
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
              {isSignUp && <TermsNote />}
              {/* Debug builds only, so these words aren't in a release at all. */}
              {__DEV__ && step === 'credentials' && !isSignUp && config.mock.auth && (
                <Text className="text-center text-xs text-brand-warmgray">
                  Demo account: ahmad@sahla.jo / sahla1234
                </Text>
              )}
              {__DEV__ && step === 'otp' && (
                <Text className="text-center text-xs text-brand-warmgray">
                  Demo code: 123456
                </Text>
              )}
            </View>
          </View>

          <View className="gap-5 border-t border-brand-border pt-4">
            {step === 'credentials' && (
              <Pressable
                onPress={switchMode}
                accessibilityRole="button"
                className="min-h-11 flex-row flex-wrap items-center justify-center gap-1"
              >
                <Text className="font-sans-medium text-sm text-brand-warmgray">
                  {t(
                    isSignUp
                      ? 'auth.haveAccountQuestion'
                      : 'auth.noAccountQuestion',
                  )}
                </Text>
                <Text className="font-sans-bold text-sm text-brand-primary">
                  {t(
                    isSignUp
                      ? 'auth.haveAccountAction'
                      : 'auth.noAccountAction',
                  )}
                </Text>
              </Pressable>
            )}
            <View className="flex-row">
              {TRUST.map(item => (
                <View key={item.icon} className="flex-1 items-center gap-1.5">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-success-soft">
                    <Icon name={item.icon} size={18} color={colors.primary} />
                  </View>
                  <Text className="text-center font-sans-bold text-[11px] text-brand-warmgray">
                    {t(item.label)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
