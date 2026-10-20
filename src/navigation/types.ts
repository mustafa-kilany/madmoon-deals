// Typed routes. The prototype's ScreenId values map here as screens are ported;
// see DEVELOPMENT_GUIDE.md §1 for the full list.

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CategoryId } from '@/lib/types';

/** Bottom tabs: Home · Auctions · Sell · Chats · Profile. */
export type TabParamList = {
  Home: undefined;
  Auctions: undefined;
  /** Never shown: the raised Sell button opens AddListing on the root stack. */
  Sell: undefined;
  Chats: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Search: undefined;
  Category: { categoryId: CategoryId };
  Product: { itemId: string };
  /** Auction detail + bidding (Phase 5). */
  AuctionBidding: { itemId: string };
  /** Phase 5. */
  MakeOffer: { itemId: string };
  /** Listing price, or the accepted offer's price when offerId is given. */
  Checkout: { itemId: string; offerId?: string };
  AddListing: undefined;
  Saved: undefined;
  OrderTracking: undefined;
  /** Courier: enter the buyer's PIN to confirm delivery (role 'courier'). */
  CourierConfirm: undefined;
  /** Sign-in choice; reached through startAuth / useRequireAuth. */
  Auth: undefined;
  EmailAuth: { mode: 'signup' | 'login' } | undefined;
  /** signup = create a verified account; verify = upgrade the signed-in account. */
  IdVerification: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // Lets useNavigation() know every route without a generic argument.
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
