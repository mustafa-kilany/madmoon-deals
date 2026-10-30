// Money is always an integer number of fils (1 JOD = 1000 fils); never use
// floats for amounts. Format only when displaying.

import type { Lang } from './types';

export const FILS_PER_JOD = 1000;

/** Whole or decimal dinars → fils, e.g. jod(12.5) === 12500. For seed data and parsed input. */
export const jod = (dinars: number): number =>
  Math.round(dinars * FILS_PER_JOD);

/**
 * The number part of a price, as the prototype shows it: whole dinars without
 * decimals ("520"), otherwise all three decimal places ("12.500"). Western digits
 * in both languages.
 */
export function formatAmount(fils: number): string {
  const sign = fils < 0 ? '-' : '';
  const abs = Math.abs(Math.round(fils));
  const whole = Math.floor(abs / FILS_PER_JOD);
  const rest = abs % FILS_PER_JOD;
  return rest === 0
    ? `${sign}${whole}`
    : `${sign}${whole}.${String(rest).padStart(3, '0')}`;
}

/** Currency unit label, shown after the amount. */
export const currencyLabel = (lang: Lang): string =>
  lang === 'ar' ? 'د.أ' : 'JOD';

/** "520 JOD" / "520 د.أ". Wrap in <Ltr> when shown inside Arabic text. */
export const formatJOD = (fils: number, lang: Lang): string =>
  `${formatAmount(fils)} ${currencyLabel(lang)}`;

export type PricingBreakdown = {
  itemPriceFils: number;
  buyerProtectionFils: number;
  deliveryFils: number;
  totalFils: number;
};

/**
 * Escrow pricing breakdown (DEVELOPMENT_GUIDE §3.2):
 * - Item price
 * - Buyer protection: 3% of item price, minimum 1 JOD (1000 fils)
 * - Delivery: 2 JOD flat (2000 fils)
 */
export function calculateCheckoutBreakdown(
  itemPriceFils: number,
): PricingBreakdown {
  const protectionFils = Math.max(1000, Math.round(itemPriceFils * 0.03));
  const deliveryFils = 2000;
  const totalFils = itemPriceFils + protectionFils + deliveryFils;
  return {
    itemPriceFils,
    buyerProtectionFils: protectionFils,
    deliveryFils,
    totalFils,
  };
}
