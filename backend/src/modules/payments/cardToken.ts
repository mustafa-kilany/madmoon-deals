import { z } from 'zod';

// S3.2: card numbers never reach Sahla (PCI SAQ A): the provider's SDK or page swaps
// the card for a token first. This is the second fence: a request with a real-looking
// card number in it (an app bug, a bad client) is refused without repeating it back,
// and it is never charged, stored or logged (request bodies aren't logged at all).
const looksLikeCardNumber = (value: string) => /^[\d\s-]{12,23}$/.test(value) && /^\d{12,19}$/.test(value.replace(/[\s-]/g, ''));

export const cardTokenField = z
  .string()
  .min(1)
  .max(500)
  .refine(value => !looksLikeCardNumber(value), { error: 'send the provider’s token, never a card number' });
