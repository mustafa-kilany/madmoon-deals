// Asks a signed-in customer to accept the current terms and privacy policy
// when their account accepted an older version, or none (BACKEND_PLAN B15.8).
// Blocks the app until they accept or log out; the documents open inside it.
// Drivers (staff) aren't asked.

import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Heading, Text } from '@/components/ui';
import { useLogOut } from '@/features/auth/hooks/useAccount';
import { useSessionStore, useUser } from '@/features/auth/sessionStore';
import { useLocalized } from '@/i18n';
import { LEGAL_VERSION, legalDocs, type LegalDocId } from '@/legal';
import { authService } from '@/services/auth';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';

export function TermsUpdatePrompt() {
  const { t } = useTranslation();
  const localized = useLocalized();
  const user = useUser();
  const logOut = useLogOut();
  const [reading, setReading] = useState<LegalDocId | null>(null);
  const accept = useMutation({
    mutationFn: () => authService.acceptTerms(LEGAL_VERSION),
    onSuccess: updated => useSessionStore.setState({ user: updated }),
    onError: error => toast.error(t(errorMessageKey(error))),
  });
  const show =
    !!user && user.role !== 'courier' && user.termsVersion !== LEGAL_VERSION;
  if (!show) return null;
  const doc = reading && legalDocs[reading];

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/50 p-6">
        <View className="max-h-[85%] w-full gap-4 rounded-2xl bg-brand-surface p-6">
          {doc ? (
            <>
              <Heading className="text-xl">{localized(doc.title)}</Heading>
              <ScrollView contentContainerClassName="gap-3">
                {doc.sections.map(section => (
                  <View key={section.title.en} className="gap-1">
                    <Text className="font-sans-bold text-sm">
                      {localized(section.title)}
                    </Text>
                    <Text className="text-sm leading-relaxed">
                      {localized(section.body)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <Button
                variant="secondary"
                label={t('common.back')}
                onPress={() => setReading(null)}
              />
            </>
          ) : (
            <>
              <Heading className="text-xl">{t('legal.updateTitle')}</Heading>
              <Text className="text-sm leading-relaxed">
                {t('legal.updateBody')}
              </Text>
              <View className="flex-row gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  label={t('legal.terms')}
                  onPress={() => setReading('terms')}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  label={t('legal.privacy')}
                  onPress={() => setReading('privacy')}
                />
              </View>
              <Button
                testID="terms-accept"
                label={t('legal.accept')}
                loading={accept.isPending}
                onPress={() => accept.mutate()}
              />
              <Button
                variant="secondary"
                label={t('sidebar.logOut')}
                onPress={() => logOut.mutate()}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
