// The notification inbox (BACKEND_REVIEW M2): every push the account was sent, newest first. Opening
// it reads them all; tapping one opens the same screen its push would.

import { useEffect } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { StatusView } from '@/components/StatusView';
import { Heading, Screen, Text } from '@/components/ui';
import { go } from '@/features/auth/authFlow';
import { useLang } from '@/i18n';
import { formatDate } from '@/lib/dates';
import { notificationsService, type InboxItem } from '@/services/notifications';
import { routeForPush } from '@/services/push/routeForPush';
import { queryClient } from '@/services/queryClient';
import { colors } from '@/theme/colors';
import { useInbox } from './useInbox';

export function NotificationsScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const { data, isLoading, isError, refetch } = useInbox();
  const markRead = useMutation({
    mutationFn: notificationsService.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = data?.unreadCount ?? 0;
  const { mutate } = markRead;
  useEffect(() => {
    if (unread) mutate();
  }, [unread, mutate]);

  const header = (
    <>
      <BackButton />
      <Heading className="flex-1 text-xl">{t('notifications.title')}</Heading>
    </>
  );

  const open = (item: InboxItem) => {
    const route = routeForPush({ type: item.type, id: item.refId ?? '' });
    if (route) go(route);
  };

  return (
    <Screen header={header}>
      {isLoading ? (
        <StatusView status="loading" />
      ) : isError || !data ? (
        <StatusView status="error" onRetry={refetch} />
      ) : (
        <FlatList
          data={data.items}
          keyExtractor={item => item.id}
          contentContainerClassName="gap-2 p-4 pb-8"
          ListEmptyComponent={
            <View className="items-center gap-3 p-8">
              <Icon name="Bell" size={40} color={colors.warmgray} />
              <Text className="text-center text-sm text-brand-warmgray">
                {t('notifications.empty')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`notification-${item.id}`}
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? '' : `${t('notifications.new')}: `}${item.title}. ${item.body}`}
              className="flex-row gap-3 rounded-xl bg-brand-surface p-4 active:opacity-80"
            >
              <View
                className={`mt-1.5 h-2.5 w-2.5 rounded-full ${item.read ? 'bg-transparent' : 'bg-brand-primary'}`}
              />
              <View className="flex-1 gap-1">
                <Text className="font-sans-bold text-sm">{item.title}</Text>
                <Text className="text-sm leading-relaxed">{item.body}</Text>
                <Text className="text-xs text-brand-warmgray">
                  {formatDate(item.createdAt, lang)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
