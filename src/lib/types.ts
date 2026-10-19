// Shared domain types. Ported from the prototype's lib/types.ts, with two
// changes: catalog text is stored in both languages (`Localized`) instead of
// being translated at creation time, and money is integer fils (1 JOD = 1000).

import type { ImageSourcePropType } from 'react-native';
import type { IconName } from '@/components/icons';

export type Lang = 'ar' | 'en';

/** Catalog text that comes with the data (titles, names), in both languages. */
export type Localized = { ar: string; en: string };

export type CategoryId =
  | 'clothing'
  | 'tech'
  | 'vehicles'
  | 'furniture'
  | 'shoes'
  | 'gaming'
  | 'watches'
  | 'more';

export type Category = {
  id: CategoryId;
  name: Localized;
  /** Square product photo used as the category tile (bundled). */
  image: ImageSourcePropType;
  /** Line icon shown if the image fails to load. */
  icon: IconName;
};

/** A sub-type within a category (e.g. Phones under Tech), used for filtering. */
export type ItemType = { id: string; name: Localized };

export type CategoryFilters = { types: ItemType[]; brands: string[] };

/** Condition keys; labels and tag colors come from i18n and ConditionTag. */
export type Condition = 'new' | 'excellent' | 'good' | 'loved';

export type SaleType = 'fixed' | 'auction';

export type Auction = {
  /** Epoch milliseconds. */
  endsAt: number;
  bidCount: number;
  incrementFils: number;
};

/** A marketplace listing. */
export type Item = {
  id: string;
  category: CategoryId;
  title: Localized;
  /** Fixed price, or the current bid for auctions. Integer fils. */
  priceFils: number;
  imageUrl: string;
  condition: Condition;
  seller: Localized;
  brand?: string;
  /** ItemType id within the category. */
  type: string;
  verified: boolean;
  location: Localized;
  saleType: SaleType;
  auction?: Auction;
};
