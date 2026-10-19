// Email sign-up (prototype EmailAuth) plus log-in for returning users, which
// the prototype doesn't have but a real backend needs. Sign-up creates an
// unverified account; the ID can be added later from Profile.

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
import { colors } from '@/theme/colors';
import { useLogInWithEmail, useSignUpWithEmail } from '../hooks/useAccount';
import { useFieldError } from '../hooks/useFieldError';

// Messages are i18n keys, translated when shown.
const logInSchema = z.object({
  name: z.string(),
  email: z.email('validation.emailInvalid'),
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
  const [mode, setMode] = useState(route.params?.mode ?? 'signup');
  const signUp = useSignUpWithEmail();
  const logIn = useLogInWithEmail();
  const isSignUp = mode === 'signup';
  const mutation = isSignUp ? signUp : logIn;

  const { control, handleSubmit, formState, clearErrors } = useForm<FormValues>(
    {
      resolver: zodResolver(isSignUp ? signUpSchema : logInSchema),
      defaultValues: { name: '', email: '', password: '' },
    },
  );
  const { errors } = formState;

  const submit = handleSubmit(values =>
    isSignUp
      ? signUp.mutate(values)
      : logIn.mutate({ email: values.email, password: values.password }),
  );

  const switchMode = () => {
    clearErrors(); // the two modes validate differently
    signUp.reset();
    logIn.reset();
    setMode(isSignUp ? 'login' : 'signup');
  };

  return (
    <Screen
      tone="white"
      headerBorder
      header={
        <>
          <BackButton />
          <Heading className="text-xl">
            {t(isSignUp ? 'screens.emailSignUp' : 'screens.emailLogIn')}
          </Heading>
        </>
      }
    >
      {/* Android too: with edge-to-edge the window no longer resizes for the keyboard. */}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 p-6"
          keyboardShouldPersistTaps="handled"
        >
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
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                textContentType={isSignUp ? 'newPassword' : 'password'}
                onSubmitEditing={() => submit()}
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

          {!isSignUp && config.useMockApi && (
            <Text className="text-center text-xs text-brand-warmgray">
              {t('auth.demoHint')}
            </Text>
          )}
        </ScrollView>

        <View
          className="gap-3 border-t border-brand-border p-6"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          {mutation.isError && (
            <Text
              accessibilityRole="alert"
              className="text-center font-sans-bold text-sm text-brand-danger"
            >
              {t(errorMessageKey(mutation.error))}
            </Text>
          )}
          <Button
            size="lg"
            label={t(isSignUp ? 'auth.createAccount' : 'auth.logIn')}
            loading={mutation.isPending}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
