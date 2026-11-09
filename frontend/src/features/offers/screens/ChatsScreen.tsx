// Secure Chat & Offers screen (Phase 5): active thread list, message stream,
// offer status cards, and chat messaging. Offer buttons follow the turn: the
// seller answers a pending offer (accept, counter, reject), the buyer answers
// a counter (accept, reject), and only the buyer checks out. The newest
// message about an offer carries its buttons. The header menu reports or
// blocks the other person.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  useIsFocused,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/icons';
import { Price } from '@/components/Price';
import { ReconnectingBanner } from '@/components/ReconnectingBanner';
import { StatusView } from '@/components/StatusView';
import {
  Button,
  Card,
  Heading,
  Screen,
  Text,
  TextField,
} from '@/components/ui';
import { UnreadBadge } from '@/components/UnreadBadge';
import { config } from '@/config';
import { useUser } from '@/features/auth/sessionStore';
import { useLang, useLocalized } from '@/i18n';
import { formatJOD, jod } from '@/lib/money';
import type { ChatMessage, ChatThread, Offer, OfferStatus } from '@/lib/types';
import { errorMessageKey } from '@/services/api/errors';
import { toast } from '@/store/toastStore';
import type { TabParamList } from '@/navigation/types';
import { colors } from '@/theme/colors';
import { useLiveAccountStatus } from '../hooks/useLiveAccount';
import {
  useBlockUser,
  useChatMessages,
  useChatThreads,
  useMarkChatRead,
  useRespondToOffer,
  useSendMessage,
} from '../hooks/useNegotiation';

export function ChatsScreen() {
  const { t } = useTranslation();
  const localized = useLocalized();
  // Changes arrive over the live connection; the polls catch whatever it can't carry. A tab stays
  // mounted when it's left, and the unread badge has its own poll, so a hidden one asks for nothing.
  const isFocused = useIsFocused();
  const { connected } = useLiveAccountStatus();
  const pollMs = !isFocused
    ? false
    : connected
      ? config.pollMs.chatLive
      : config.pollMs.chat;
  const {
    data: threads = [],
    isLoading,
    isError,
    refetch,
  } = useChatThreads({ pollMs });
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // A tapped push about a chat or an offer opens that conversation.
  const navigation =
    useNavigation<BottomTabNavigationProp<TabParamList, 'Chats'>>();
  const pushedChatId =
    useRoute<RouteProp<TabParamList, 'Chats'>>().params?.chatId;
  useEffect(() => {
    if (!pushedChatId) return;
    setActiveChatId(pushedChatId);
    navigation.setParams({ chatId: undefined });
  }, [pushedChatId, navigation]);

  const activeThread = threads.find(t => t.id === activeChatId);

  if (activeThread) {
    return (
      <ActiveChatView
        thread={activeThread}
        pollMs={pollMs}
        onBack={() => setActiveChatId(null)}
      />
    );
  }

  return (
    <Screen header={<Heading className="text-2xl">{t('chats.title')}</Heading>}>
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
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[10px] text-brand-warmgray">
                      {new Date(thread.updatedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    <UnreadBadge
                      count={thread.unreadCount}
                      testID={`chat-unread-${thread.id}`}
                    />
                  </View>
                </View>
                <Text
                  className="font-sans-medium text-xs text-brand-warmgray"
                  numberOfLines={1}
                >
                  {localized(thread.itemTitle)}
                </Text>
                <Text
                  className={`mt-1 text-xs ${
                    thread.unreadCount > 0
                      ? 'font-sans-bold text-brand-espresso'
                      : 'font-sans-medium text-brand-warmgray'
                  }`}
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
  pollMs,
  onBack,
}: {
  thread: ChatThread;
  pollMs: number | false;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const localized = useLocalized();
  const navigation = useNavigation();
  const user = useUser();
  const [text, setText] = useState('');
  const { data: messages = [], isLoading } = useChatMessages(thread.id, pollMs);
  const sendMessage = useSendMessage();
  const blockUser = useBlockUser();
  const { reconnecting } = useLiveAccountStatus();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  // New messages arrive on their own now: keep the newest in sight.
  const count = messages.length;
  useEffect(() => {
    if (count) setTimeout(() => scroll.current?.scrollToEnd(), 50);
  }, [count]);

  // Read only when the person can really see it: not with the app in the background, or from
  // another tab (this view stays mounted under it).
  const isFocused = useIsFocused();
  const { mutate: markRead } = useMarkChatRead();
  const lastMessageId = messages[messages.length - 1]?.id;
  const markedUpTo = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !lastMessageId ||
      !thread.unreadCount ||
      !isFocused ||
      AppState.currentState !== 'active' ||
      markedUpTo.current === lastMessageId
    )
      return;
    markedUpTo.current = lastMessageId;
    markRead(
      { chatId: thread.id, messageId: lastMessageId },
      {
        onError: () => {
          markedUpTo.current = undefined; // the next change tries again
        },
      },
    );
  }, [lastMessageId, thread.id, thread.unreadCount, isFocused, markRead]);

  // Only the newest message about each offer shows its buttons.
  const actionable = useMemo(() => {
    const latest = new Map<string, string>();
    for (const m of messages) if (m.offer) latest.set(m.offer.id, m.id);
    return new Set(latest.values());
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage.mutate(
      { chatId: thread.id, text: text.trim() },
      {
        onSuccess: () => setText(''),
        onError: error => toast.error(t(errorMessageKey(error))),
      },
    );
  };

  const block = () =>
    Alert.alert(
      t('chats.blockTitle', { name: thread.otherPartyName }),
      t('chats.blockBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('chats.block'),
          style: 'destructive',
          onPress: () =>
            blockUser.mutate(thread.otherPartyId, {
              onSuccess: () => {
                toast.success(
                  t('chats.blocked', { name: thread.otherPartyName }),
                );
                onBack();
              },
              onError: error => toast.error(t(errorMessageKey(error))),
            }),
        },
      ],
    );

  const showOptions = () =>
    Alert.alert(thread.otherPartyName, undefined, [
      {
        text: t('chats.report'),
        onPress: () =>
          navigation.navigate('Report', {
            type: 'user',
            id: thread.otherPartyId,
          }),
      },
      { text: t('chats.block'), style: 'destructive', onPress: block },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

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
          <Pressable
            onPress={showOptions}
            accessibilityRole="button"
            accessibilityLabel={t('chats.options')}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center"
          >
            <Icon name="More" size={22} />
          </Pressable>
        </>
      }
    >
      {reconnecting && (
        <ReconnectingBanner
          testID="chat-reconnecting"
          message={t('chats.reconnecting')}
        />
      )}
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          ref={scroll}
          contentContainerClassName="gap-4 p-5 pb-8"
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <StatusView status="loading" />
          ) : (
            messages.map(msg => (
              <MessageItem
                key={msg.id}
                message={msg}
                myId={user?.id}
                showActions={actionable.has(msg.id)}
              />
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
  myId,
  showActions,
}: {
  message: ChatMessage;
  myId: string | undefined;
  showActions: boolean;
}) {
  const isMe = message.senderId === myId;
  return (
    <View className={`gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
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
        {message.offer && (
          <OfferCard
            offer={message.offer}
            myId={myId}
            showActions={showActions}
          />
        )}
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

function OfferCard({
  offer,
  myId,
  showActions,
}: {
  offer: Offer;
  myId: string | undefined;
  showActions: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const respond = useRespondToOffer();
  const navigation = useNavigation();
  const [countering, setCountering] = useState(false);
  const [counterJod, setCounterJod] = useState('');

  const isSeller = myId === offer.sellerId;
  const isBuyer = myId === offer.buyerId;
  // Whose turn: the seller answers a pending offer, the buyer a counter.
  const myTurn =
    showActions &&
    ((offer.status === 'pending' && isSeller) ||
      (offer.status === 'countered' && isBuyer));
  const counterFils = jod(Number(counterJod) || 0);
  const shownFils =
    offer.status === 'countered' && offer.counterAmountFils
      ? offer.counterAmountFils
      : offer.amountFils;

  const answer = (status: OfferStatus, counterAmountFils?: number) =>
    respond.mutate(
      { offerId: offer.id, status, counterAmountFils },
      {
        onSuccess: () => {
          setCountering(false);
          if (status === 'accepted') toast.success(t('offers.statusAccepted'));
        },
        onError: error => toast.error(t(errorMessageKey(error))),
      },
    );

  return (
    <Card className="mt-3 gap-2 bg-brand-surface/95 p-3">
      <Text className="font-sans-bold text-xs text-brand-warmgray">
        {t('offers.title')}
      </Text>
      <Price fils={shownFils} className="text-xl text-brand-primary" />

      {offer.status === 'pending' && (
        <Text className="font-sans-bold text-xs text-brand-warmgray">
          {isSeller ? t('offers.statusPending') : t('offers.waitingSeller')}
        </Text>
      )}
      {offer.status === 'countered' && (
        <Text className="font-sans-bold text-xs text-brand-primary">
          {isSeller
            ? t('offers.waitingBuyer')
            : t('offers.statusCountered', {
                amount: formatJOD(shownFils, lang),
              })}
        </Text>
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

      {myTurn && !countering && (
        <View className="gap-2 pt-1">
          <View className="flex-row gap-2">
            <Button
              size="sm"
              label={
                offer.status === 'countered'
                  ? t('offers.acceptCounter', {
                      amount: formatJOD(shownFils, lang),
                    })
                  : t('offers.accept')
              }
              loading={respond.isPending}
              onPress={() => answer('accepted')}
              className="flex-1 px-2"
            />
            <Button
              size="sm"
              variant="secondary"
              label={t('offers.reject')}
              loading={respond.isPending}
              onPress={() => answer('rejected')}
              className="flex-1 px-2"
            />
          </View>
          {offer.status === 'pending' && (
            <Button
              size="sm"
              variant="secondary"
              label={t('offers.counter')}
              onPress={() => setCountering(true)}
            />
          )}
        </View>
      )}

      {myTurn && countering && (
        <View className="gap-2 pt-1">
          <TextField
            label={t('offers.counterPrice')}
            labelClassName="font-sans-bold text-xs text-brand-warmgray"
            value={counterJod}
            onChangeText={setCounterJod}
            keyboardType="decimal-pad"
            ltr
            error={
              counterJod && counterFils <= offer.amountFils
                ? t('validation.counterTooLow')
                : undefined
            }
          />
          <View className="flex-row gap-2">
            <Button
              size="sm"
              variant="secondary"
              label={t('common.cancel')}
              onPress={() => setCountering(false)}
              className="flex-1 px-2"
            />
            <Button
              size="sm"
              label={t('offers.sendCounter')}
              disabled={counterFils <= offer.amountFils}
              loading={respond.isPending}
              onPress={() => answer('countered', counterFils)}
              className="flex-1 px-2"
            />
          </View>
        </View>
      )}

      {showActions && offer.status === 'accepted' && isBuyer && (
        <Button
          size="sm"
          icon="Lock"
          label={t('offers.proceedToCheckout')}
          onPress={() =>
            navigation.navigate('Checkout', {
              itemId: offer.itemId,
              offerId: offer.id,
            })
          }
        />
      )}
    </Card>
  );
}
