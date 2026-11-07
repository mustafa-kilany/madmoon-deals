// Sahla's support team (BACKEND_PLAN B15.6; docs/API.md → Support): the
// support email and one chat per person. Always the real API (customers and
// drivers both use it), so there is no mock version.

import { api } from './api/client';
import { fromIso } from './api/wire';

export type SupportMessage = {
  id: string;
  /** true = Sahla support wrote it. */
  fromSupport: boolean;
  text: string;
  /** The order it's about, if any. */
  orderId?: string;
  createdAt: number;
};

export type SupportChat = { email: string; messages: SupportMessage[] };

type MessageDto = Omit<SupportMessage, 'createdAt'> & { createdAt: string };
const toMessage = (m: MessageDto): SupportMessage => ({
  ...m,
  createdAt: fromIso(m.createdAt),
});

export const supportService = {
  /** The support email and my conversation, oldest first. */
  getChat: async (): Promise<SupportChat> => {
    const chat = await api.get<{ email: string; messages: MessageDto[] }>(
      '/support',
    );
    return { email: chat.email, messages: chat.messages.map(toMessage) };
  },
  send: async (text: string, orderId?: string): Promise<SupportMessage> =>
    toMessage(
      await api.post<MessageDto>('/support/messages', { text, orderId }),
    ),
};
