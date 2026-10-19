// Root stack: the tabs plus full-screen pages pushed on top of them.

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuctionBiddingScreen } from '@/features/auctions/screens/AuctionBiddingScreen';
import { AuthScreen } from '@/features/auth/screens/AuthScreen';
import { EmailAuthScreen } from '@/features/auth/screens/EmailAuthScreen';
import { IdVerificationScreen } from '@/features/auth/screens/IdVerificationScreen';
import { CategoryScreen } from '@/features/catalog/screens/CategoryScreen';
import { ProductScreen } from '@/features/catalog/screens/ProductScreen';
import { SearchScreen } from '@/features/catalog/screens/SearchScreen';
import { CheckoutScreen } from '@/features/checkout/screens/CheckoutScreen';
import { SavedScreen } from '@/features/favorites/screens/SavedScreen';
import { AddListingScreen } from '@/features/listings/screens/AddListingScreen';
import { MakeOfferScreen } from '@/features/offers/screens/MakeOfferScreen';
import { OrderTrackingScreen } from '@/features/orders/screens/OrderTrackingScreen';
import { colors } from '@/theme/colors';
import { TabNavigator } from './TabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.lightgray },
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Category" component={CategoryScreen} />
      <Stack.Screen name="Product" component={ProductScreen} />
      <Stack.Screen name="AuctionBidding" component={AuctionBiddingScreen} />
      <Stack.Screen name="MakeOffer" component={MakeOfferScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="AddListing" component={AddListingScreen} />
      <Stack.Screen name="Saved" component={SavedScreen} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      {/* Sign-in flow (removed from history once signed in, see authFlow). */}
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="EmailAuth" component={EmailAuthScreen} />
      <Stack.Screen name="IdVerification" component={IdVerificationScreen} />
    </Stack.Navigator>
  );
}
