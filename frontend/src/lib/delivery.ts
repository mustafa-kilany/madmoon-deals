// Delivery details: Jordanian mobile numbers and the checks the checkout
// form and the server (docs/API.md → POST /orders) both apply.

import type { DeliveryDetails } from './types';

/**
 * "+962 79 123 4567", "00962791234567", "791234567" → "0791234567".
 * Returns undefined unless it is a Jordanian mobile (077 / 078 / 079).
 */
export function normalizeJordanMobile(input: string): string | undefined {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('00962')
    ? digits.slice(5)
    : digits.startsWith('962')
    ? digits.slice(3)
    : digits.startsWith('0')
    ? digits.slice(1)
    : digits;
  return /^7[789]\d{7}$/.test(local) ? `0${local}` : undefined;
}

export const ADDRESS_MIN = 5;
export const ADDRESS_MAX = 200;
export const NOTES_MAX = 200;

export type DeliveryProblem = 'name' | 'phone' | 'cityId' | 'address' | 'notes';

/** Every field that is missing or invalid (empty = ready to send). */
export function deliveryProblems(
  d: Partial<DeliveryDetails> | undefined,
): DeliveryProblem[] {
  const problems: DeliveryProblem[] = [];
  if ((d?.name?.trim().length ?? 0) < 2) problems.push('name');
  if (!normalizeJordanMobile(d?.phone ?? '')) problems.push('phone');
  if (!d?.cityId) problems.push('cityId');
  const address = d?.address?.trim().length ?? 0;
  if (address < ADDRESS_MIN || address > ADDRESS_MAX) problems.push('address');
  if ((d?.notes?.length ?? 0) > NOTES_MAX) problems.push('notes');
  return problems;
}
