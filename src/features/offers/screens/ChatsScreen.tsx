// Secure Chat & Offers screen (Phase 5): active thread list, message stream,
// offer status cards, inline Accept/Counter/Reject buttons, and chat messaging.

import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { Price } from '@/components/Price';
import { StatusView } from '@/components/StatusView';
import { Button, Card, Heading, Screen, Text, TextField } from '@/components/ui';
import { useLang, useLocalized } from '@/i18n';
import { formatJOD } from '@/lib/money';
import type { ChatMessage, ChatThread, Offer } from '@/lib/types';
import { toast } from '@/store/toastStore';
import { colors } from '@/theme/colors';
import {
  useChatMessages,
  useChatThreads,
  useRespondToOffer,
  useSendMessage,
} from '../hooks/useNegotiation';

export function ChatsScreen() {
  const { t } = useTranslation();
  const localized = useLocalized();
  const { data: threads = [], isLoading, isError, refetch } = useChatThreads();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const activeThread = threads.find(t => t.id === activeChatId);

  if (activeThread) {
    return (
      <ActiveChatView
        thread={activeThread}
        onBack={() => setActiveChatId(null)}
      />
    );
  }

  return (
    <Screen
      header={
        <Heading className="text-2xl">{t('chats.title')}</Heading>
      }
    >
      {isLoading ? (
        <StatusView status="loading" />
      ) : isError ? (
        <StatusView status="error" onRetry={refetch} />
      ) : threads.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <Icon name="Chat" size={48} color={`${colors.warmgray}80`} />
          <Heading className="text-xl">{t('chats.emptyTitle')}</Heading>
          <Text className="text-center font-sans-medium text-sm text-brand-warmgray">
            {t('chats.emptyBody')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-3 p-5">
          {threads.map(thread => (
            <Pressable
              key={thread.id}
              onPress={() => setActiveChatId(thread.id)}
              accessibilityRole="button"
              className="flex-row items-center gap-4 rounded-2xl border border-brand-border bg-brand-surface p-4 shadow-sm active:bg-brand-lightgray"
            >
              <Image
                source={{ uri: thread.itemImageUrl }}
                className="h-14 w-14 rounded-xl"
              />
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="font-sans-bold text-base">
                    {thread.otherPartyName}
                  </Text>
                  <Text className="text-[10px] text-brand-warmgray">
                    {new Date(thread.updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text
                  className="font-sans-medium text-xs text-brand-warmgray"
                  numberOfLines={1}
                >
                  {localized(thread.itemTitle)}
                </Text>
                <Text
                  className="mt-1 font-sans-bold text-xs text-brand-espresso"
                  numberOfLines={1}
                >
                  {thread.lastMessage}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function ActiveChatView({
  thread,
  onBack,
}: {
  thread: ChatThread;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const [text, setText] = useState('');
  const { data: messages = [], isLoading } = useChatMessages(thread.id);
  const sendMessage = useSendMessage();

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage.mutate(
      { chatId: thread.id, text: text.trim() },
      { onSuccess: () => setText('') },
    );
  };

  return (
    <Screen
      header={
        <>
          <BackButton onPress={onBack} />
          <Image
            source={{ uri: thread.itemImageUrl }}
            className="h-9 w-9 rounded-lg"
          />
          <View className="flex-1">
            <Heading className="text-base" numberOfLines={1}>
              {thread.otherPartyName}
            </Heading>
            <Text className="text-xs text-brand-warmgray" numberOfLines={1}>
              {localized(thread.itemTitle)}
            </Text>
          </View>
        </>
      }
    >
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          contentContainerClassName="gap-4 p-5 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <StatusView status="loading" />
          ) : (
            messages.map(msg => (
              <MessageItem key={msg.id} message={msg} thread={thread} />
            ))
          )}
        </ScrollView>

        <View className="flex-row items-center gap-2 border-t border-brand-border bg-brand-surface p-3">
          <TextField
            className="flex-1"
            value={text}
            onChangeText={setText}
            placeholder={t('chats.typeMessage')}
            onSubmitEditing={handleSend}
            variant="muted"
          />
          <Button
            label={t('chats.send')}
            size="sm"
            loading={sendMessage.isPending}
            onPress={handleSend}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function MessageItem({
  message,
  thread,
}: {
  message: ChatMessage;
  thread: ChatThread;
}) {
  const isMe = message.senderId === 'me';
  return (
    <View
      className={`gap-1 ${isMe ? 'items-end' : 'items-start'}`}
    >
      <View
        className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
          isMe
            ? 'bg-brand-primary'
            : 'border border-brand-border bg-brand-surface'
        }`}
      >
        <Text
          className={`font-sans-medium text-sm ${
            isMe ? 'text-brand-on-primary' : 'text-brand-espresso'
          }`}
        >
          {message.text}
        </Text>
        {message.offer && <OfferCard offer={message.offer} thread={thread} />}
      </View>
      <Text className="px-2 text-[10px] text-brand-warmgray">
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}

function OfferCard({ offer, thread }: { offer: Offer; thread: ChatThread }) {
  const { t } = useTranslation();
  const lang = useLang();
  const respond = useRespondToOffer();

  const handleRespond = (status: 'accepted' | 'rejected') => {
    respond.mutate(
      { offerId: offer.id, status },
      {
        onSuccess: () => {
          toast.success(
            status === 'accepted'
              ? t('offers.statusAccepted')
              : t('offers.statusRejected'),
          );
        },
      },
    );
  };

  return (
    <Card className="mt-3 gap-2 bg-brand-surface/95 p-3">
      <Text className="font-sans-bold text-xs text-brand-warmgray">
        {t('offers.title')}
      </Text>
      <Price fils={offer.amountFils} className="text-xl text-brand-primary" />

      {offer.status === 'pending' && (
        <View className="gap-2 pt-1">
          <Text className="font-sans-bold text-xs text-brand-warmgray">
            {t('offers.statusPending')}
          </Text>
          <View className="flex-row gap-2">
            <Button
              size="sm"
              label={t('offers.accept')}
              loading={respond.isPending}
              onPress={() => handleRespond('accepted')}
              className="flex-1"
            />
            <Button
              size="sm"
              variant="secondary"
              label={t('offers.reject')}
              loading={respond.isPending}
              onPress={() => handleRespond('rejected')}
              className="flex-1"
            />
          </View>
        </View>
      )}

      {offer.status === 'accepted' && (
        <Text className="font-sans-bold text-xs text-brand-success">
          {t('offers.statusAccepted')}
        </Text>
      )}

      {offer.status === 'rejected' && (
        <Text className="font-sans-bold text-xs text-brand-danger">
          {t('offers.statusRejected')}
        </Text>
      )}

      {offer.status === 'countered' && (
        <Text className="font-sans-bold text-xs text-brand-primary">
          {t('offers.statusCountered', {
            amount: formatJOD(offer.amountFils, lang),
          })}
        </Text>
      )}
    </Card>
  );
}
