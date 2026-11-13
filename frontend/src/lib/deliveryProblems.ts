// Why an order didn't reach the buyer (BACKEND_PLAN B15.3–B15.4). Shared by the
// app (reason lists, what buyers and sellers read) and the backend (validation,
// push texts), so both always say the same thing.

import type { Localized } from './types';

/** The buyer cancels a paid order before the driver has picked it up. */
export const CANCEL_REASONS = [
  'changed_mind',
  'found_better',
  'ordered_by_mistake',
  'too_slow',
  'seller_unresponsive',
  'other',
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/** The driver couldn't collect the item from the seller. */
export const PICKUP_FAIL_REASONS = [
  'seller_unavailable',
  'seller_refused',
  'item_not_as_listed',
  'item_damaged',
  'wrong_pickup_address',
  'other',
] as const;

/** The driver couldn't hand the item to the buyer. */
export const DROPOFF_FAIL_REASONS = [
  'buyer_unavailable',
  'buyer_refused_defect',
  'buyer_refused_not_as_described',
  'buyer_refused_wrong_item',
  'buyer_changed_mind',
  'wrong_address',
  'other',
] as const;
export type FailStage = 'pickup' | 'dropoff';
export type FailReason =
  | (typeof PICKUP_FAIL_REASONS)[number]
  | (typeof DROPOFF_FAIL_REASONS)[number];

export const failReasonsFor = (stage: FailStage): readonly FailReason[] =>
  stage === 'pickup' ? PICKUP_FAIL_REASONS : DROPOFF_FAIL_REASONS;

/** The buyer, at the door, reports a problem with the item instead of giving the PIN. */
export const ITEM_ISSUE_REASONS = [
  'defect',
  'not_as_described',
  'wrong_item',
  'missing_parts',
  'damaged_in_delivery',
  'other',
] as const;
export type ItemIssueReason = (typeof ITEM_ISSUE_REASONS)[number];

export type ProblemReason = CancelReason | FailReason | ItemIssueReason;

/** "other" needs a few words of explanation. */
export const NOTE_MAX = 500;
export const needsNote = (reason: string) => reason === 'other';

const LABELS: Record<ProblemReason, Localized> = {
  // cancelling
  changed_mind: { ar: 'غيّرت رأيي', en: 'I changed my mind' },
  found_better: { ar: 'وجدت عرضاً أفضل', en: 'I found a better deal' },
  ordered_by_mistake: { ar: 'طلبته بالخطأ', en: 'I ordered it by mistake' },
  too_slow: { ar: 'التوصيل يأخذ وقتاً طويلاً', en: 'Delivery is taking too long' },
  seller_unresponsive: { ar: 'البائع لا يرد', en: 'The seller isn’t answering' },
  other: { ar: 'سبب آخر', en: 'Another reason' },
  // the driver at the seller
  seller_unavailable: { ar: 'البائع لم يكن موجوداً', en: 'The seller wasn’t there' },
  seller_refused: { ar: 'البائع رفض تسليم المنتج', en: 'The seller refused to hand it over' },
  item_not_as_listed: { ar: 'المنتج لا يطابق الإعلان', en: 'The item doesn’t match the listing' },
  item_damaged: { ar: 'المنتج متضرر', en: 'The item is damaged' },
  wrong_pickup_address: { ar: 'عنوان الاستلام خاطئ', en: 'Wrong pickup address' },
  // the driver at the buyer
  buyer_unavailable: { ar: 'المشتري لم يكن موجوداً', en: 'The buyer wasn’t there' },
  buyer_refused_defect: { ar: 'رفض المشتري: في المنتج عيب', en: 'Buyer refused: the item has a defect' },
  buyer_refused_not_as_described: {
    ar: 'رفض المشتري: المنتج لا يطابق الوصف',
    en: 'Buyer refused: not as described',
  },
  buyer_refused_wrong_item: { ar: 'رفض المشتري: منتج مختلف', en: 'Buyer refused: wrong item' },
  buyer_changed_mind: { ar: 'المشتري غيّر رأيه', en: 'The buyer changed their mind' },
  wrong_address: { ar: 'عنوان التوصيل خاطئ', en: 'Wrong delivery address' },
  // the buyer's report at the door
  defect: { ar: 'في المنتج عيب', en: 'The item has a defect' },
  not_as_described: { ar: 'المنتج لا يطابق الوصف', en: 'Not as described' },
  wrong_item: { ar: 'منتج مختلف عن المطلوب', en: 'It’s not the item I bought' },
  missing_parts: { ar: 'أجزاء ناقصة', en: 'Parts are missing' },
  damaged_in_delivery: { ar: 'تضرر أثناء التوصيل', en: 'Damaged during delivery' },
};

export const reasonLabel = (reason: string): Localized =>
  LABELS[reason as ProblemReason] ?? LABELS.other;
