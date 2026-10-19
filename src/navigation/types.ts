// Typed routes. The prototype's ScreenId values map here as screens are ported;
// see DEVELOPMENT_GUIDE.md §1 for the full list.

import type { NavigatorScreenParams } from '@react-navigation/native';

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
  AddListing: undefined;
  Saved: undefined;
  OrderTracking: undefined;
  Auth: undefined;
};

declare global {
  // Lets useNavigation() know every route without a generic argument.
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
