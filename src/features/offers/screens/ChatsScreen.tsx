// Chats tab. Phase 5 ports the prototype's SecureChat.

import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export function ChatsScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('screens.chats')} />;
}
