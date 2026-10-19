// Root stack: the tabs plus full-screen pages pushed on top of them.

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuctionBiddingScreen } from '@/features/auctions/screens/AuctionBiddingScreen';
import { AuthScreen } from '@/features/auth/screens/AuthScreen';
import { CategoryScreen } from '@/features/catalog/screens/CategoryScreen';
import { ProductScreen } from '@/features/catalog/screens/ProductScreen';
import { SearchScreen } from '@/features/catalog/screens/SearchScreen';
import { SavedScreen } from '@/features/favorites/screens/SavedScreen';
import { AddListingScreen } from '@/features/listings/screens/AddListingScreen';
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
      <Stack.Screen name="AddListing" component={AddListingScreen} />
      <Stack.Screen name="Saved" component={SavedScreen} />
      <Stack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      <Stack.Screen name="Auth" component={AuthScreen} />
    </Stack.Navigator>
  );
}
