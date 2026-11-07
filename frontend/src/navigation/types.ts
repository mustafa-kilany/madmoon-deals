// Typed routes. The prototype's ScreenId values map here as screens are ported;
// see DEVELOPMENT_GUIDE.md §1 for the full list.

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FailStage } from '@/lib/deliveryProblems';
import type { CategoryId, ReportTarget } from '@/lib/types';

/** Bottom tabs: Home · Auctions · Sell · Chats · Profile. */
export type TabParamList = {
  Home: undefined;
  Auctions: undefined;
  /** Never shown: the raised Sell button opens AddListing on the root stack. */
  Sell: undefined;
  /** chatId: open that conversation (a tapped push). */
  Chats: { chatId?: string } | undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Search: undefined;
  Category: { categoryId: CategoryId };
  /** Certified Refurbished store: brand-certified listings with a warranty. */
  Refurbished: undefined;
  Product: { itemId: string };
  /** Auction detail + bidding (Phase 5). */
  AuctionBidding: { itemId: string };
  /** Phase 5. */
  MakeOffer: { itemId: string };
  /** Listing price, or the accepted offer's price when offerId is given. */
  Checkout: { itemId: string; offerId?: string };
  AddListing: undefined;
  /** B15.2: the seller edits or withdraws their listing. */
  EditListing: { itemId: string };
  /** B15.9: what I sold and where each delivery stands. */
  MySales: undefined;
  Saved: undefined;
  OrderTracking: undefined;
  /** Courier mode (role 'courier'): the assigned deliveries, and one of them. */
  Deliveries: undefined;
  Delivery: { orderId: string };
  /**
   * Pick a reason (B15.3–B15.4): the buyer cancels or reports a problem with the
   * item; the driver marks a delivery failed at the pickup or drop-off.
   */
  OrderProblem:
    | { kind: 'cancel' | 'itemIssue'; orderId: string }
    | { kind: 'deliveryFailed'; orderId: string; stage: FailStage };
  /** Sign-in choice; reached through startAuth / useRequireAuth. */
  Auth: undefined;
  EmailAuth: { mode: 'signup' | 'login' } | undefined;
  /** Forgot password: email → code + new password → signed in. */
  ResetPassword: { email?: string } | undefined;
  /** signup = create a verified account; verify = upgrade the signed-in account. */
  IdVerification: undefined;
  /** Report a listing or a user (App Store guideline 1.2). */
  Report: ReportTarget;
};

export type RootScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // Lets useNavigation() know every route without a generic argument.
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
