// Root stack: the tabs plus full-screen pages pushed on top of them. A courier
// account gets only the courier screens (BACKEND_PLAN B14.7): logging in or
// out swaps the whole set, and the first screen of the new set opens.

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuctionBiddingScreen } from '@/features/auctions/screens/AuctionBiddingScreen';
import { AuthScreen } from '@/features/auth/screens/AuthScreen';
import { EmailAuthScreen } from '@/features/auth/screens/EmailAuthScreen';
import { IdVerificationScreen } from '@/features/auth/screens/IdVerificationScreen';
import { ResetPasswordScreen } from '@/features/auth/screens/ResetPasswordScreen';
import { useUser } from '@/features/auth/sessionStore';
import { DeliveriesScreen } from '@/features/courier/screens/DeliveriesScreen';
import { DeliveryScreen } from '@/features/courier/screens/DeliveryScreen';
import { CategoryScreen } from '@/features/catalog/screens/CategoryScreen';
import { ProductScreen } from '@/features/catalog/screens/ProductScreen';
import { RefurbishedScreen } from '@/features/catalog/screens/RefurbishedScreen';
import { SearchScreen } from '@/features/catalog/screens/SearchScreen';
import { CheckoutScreen } from '@/features/checkout/screens/CheckoutScreen';
import { SavedScreen } from '@/features/favorites/screens/SavedScreen';
import { AddListingScreen } from '@/features/listings/screens/AddListingScreen';
import { EditListingScreen } from '@/features/listings/screens/EditListingScreen';
import { MakeOfferScreen } from '@/features/offers/screens/MakeOfferScreen';
import { MySalesScreen } from '@/features/orders/screens/MySalesScreen';
import { PayoutAccountScreen } from '@/features/orders/screens/PayoutAccountScreen';
import { OrderProblemScreen } from '@/features/orders/screens/OrderProblemScreen';
import { OrderTrackingScreen } from '@/features/orders/screens/OrderTrackingScreen';
import { ReportScreen } from '@/features/safety/screens/ReportScreen';
import { SupportScreen } from '@/features/support/SupportScreen';
import { LegalScreen } from '@/features/legal/LegalScreen';
import { colors } from '@/theme/colors';
import { TabNavigator } from './TabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.lightgray },
};

export function RootNavigator() {
  if (useUser()?.role === 'courier')
    return (
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Deliveries" component={DeliveriesScreen} />
        <Stack.Screen name="Delivery" component={DeliveryScreen} />
        <Stack.Screen name="OrderProblem" component={OrderProblemScreen} />
        <Stack.Screen name="Support" component={SupportScreen} />
        <Stack.Screen name="Legal" component={LegalScreen} />
      </Stack.Navigator>
    );

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Category" component={CategoryScreen} />
      <Stack.Screen name="Refurbished" component={RefurbishedScreen} />
      <Stack.Screen name="Product" component={ProductScreen} />
      <Stack.Screen name="AuctionBidding" component={AuctionBiddingScreen} />
      <Stack.Screen name="MakeOffer" component={MakeOfferScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="AddListing" component={AddListingScreen} />
      <Stack.Screen name="EditListing" component={EditListingScreen} />
      <Stack.Screen name="MySales" component={MySalesScreen} />
      <Stack.Screen name="PayoutAccount" component={PayoutAccountScreen} />
      <Stack.Screen name="Saved" component={SavedScreen} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      <Stack.Screen name="OrderProblem" component={OrderProblemScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="Report" component={ReportScreen} />
      {/* Sign-in flow (removed from history once signed in, see authFlow). */}
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="EmailAuth" component={EmailAuthScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="IdVerification" component={IdVerificationScreen} />
    </Stack.Navigator>
  );
}
