// Help & support (BACKEND_PLAN B15.6): write to Sahla's support team in the
// app, or by email. One conversation per person (customers and drivers); a
// reply arrives as a push. Opened from the menu, from an order (the order
// number goes with the first message) or from a delivery.

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { ReconnectingBanner } from '@/components/ReconnectingBanner';
import { StatusView } from '@/components/StatusView';
import { Button, Heading, Ltr, Screen, Text, TextField } from '@/components/ui';
import { config } from '@/config';
import { useLiveAccountStatus } from '@/features/offers/hooks/useLiveAccount';
import type { RootScreenProps } from '@/navigation/types';
import { errorMessageKey } from '@/services/api/errors';
import { queryClient, queryKeys } from '@/services/queryClient';
import { supportService } from '@/services/support';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';

export function SupportScreen({ route }: RootScreenProps<'Support'>) {
  const { t } = useTranslation();
  const orderId = route.params?.orderId;
  const [text, setText] = useState(orderId ? t('support.aboutOrder', { id: orderId }) : '');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const { connected, reconnecting } = useLiveAccountStatus();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.support,
    queryFn: supportService.getChat,
    // A reply arrives over the live connection; this is the safety net behind it.
    refetchInterval: connected ? config.pollMs.chatLive : config.pollMs.chat,
  });
  const send = useMutation({
    mutationFn: (message: string) => supportService.send(message, orderId),
    onSuccess: () => {
      setText('');
      queryClient.invalidateQueries({ queryKey: queryKeys.support });
    },
    onError: error => toast.error(t(errorMessageKey(error))),
  });
  const count = data?.messages.length ?? 0;
  useEffect(() => {
    if (count) setTimeout(() => scroll.current?.scrollToEnd(), 50);
  }, [count]);

  const header = (
    <>
      <BackButton />
      <Heading className="flex-1 text-xl">{t('support.title')}</Heading>
    </>
  );

  return (
    <Screen header={header}>
      {reconnecting && (
        <ReconnectingBanner
          testID="support-reconnecting"
          message={t('chats.reconnecting')}
        />
      )}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          ref={scroll}
          contentContainerClassName="gap-4 p-5 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-1 rounded-xl bg-brand-surface p-4">
            <Text className="text-sm leading-relaxed">{t('support.intro')}</Text>
            {data?.email && (
              <Pressable
                onPress={() => Linking.openURL(`mailto:${data.email}`).catch(() => {})}
                accessibilityRole="link"
                className="mt-1 min-h-11 flex-row items-center gap-2"
              >
                <Icon name="Mail" size={18} color={colors.primary} />
                <Ltr testID="support-email" className="font-sans-bold text-sm text-brand-primary">
                  {data.email}
                </Ltr>
              </Pressable>
            )}
          </View>

          {isLoading ? (
            <StatusView status="loading" />
          ) : isError ? (
            <StatusView status="error" onRetry={refetch} />
          ) : (
            data?.messages.map(m => (
              <View
                key={m.id}
                className={`gap-1 ${m.fromSupport ? 'items-start' : 'items-end'}`}
              >
                <View
                  className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
                    m.fromSupport
                      ? 'border border-brand-border bg-brand-surface'
                      : 'bg-brand-primary'
                  }`}
                >
                  <Text
                    className={`font-sans-medium text-sm ${
                      m.fromSupport ? 'text-brand-espresso' : 'text-brand-on-primary'
                    }`}
                  >
                    {m.text}
                  </Text>
                </View>
                <Text className="px-2 text-[10px] text-brand-warmgray">
                  {m.fromSupport ? `${t('support.team')} · ` : ''}
                  {new Date(m.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        <View className="flex-row items-center gap-2 border-t border-brand-border bg-brand-surface p-3">
          <TextField
            className="flex-1"
            value={text}
            onChangeText={setText}
            placeholder={t('support.placeholder')}
            accessibilityLabel={t('support.placeholder')}
            maxLength={2000}
            multiline
            variant="muted"
          />
          <Button
            label={t('chats.send')}
            size="sm"
            testID="support-send"
            disabled={!text.trim()}
            loading={send.isPending}
            onPress={() => send.mutate(text.trim())}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
