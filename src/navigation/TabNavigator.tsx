// Bottom tabs with the prototype's custom tab bar (BottomNav).

import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { BottomNav } from '@/components/BottomNav';
import { AuctionsScreen } from '@/features/auctions/screens/AuctionsScreen';
import { ProfileScreen } from '@/features/auth/screens/ProfileScreen';
import { HomeScreen } from '@/features/catalog/screens/HomeScreen';
import { ChatsScreen } from '@/features/offers/screens/ChatsScreen';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

// The Sell slot is drawn by BottomNav as a button; this route is never shown.
const Empty = () => null;

const renderTabBar = (props: BottomTabBarProps) => <BottomNav {...props} />;

export function TabNavigator() {
  return (
    <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Auctions" component={AuctionsScreen} />
      <Tab.Screen name="Sell" component={Empty} />
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
