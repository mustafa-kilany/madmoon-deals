// Opening a listing: remember it in "Recently viewed", then show the product
// page, or the auction page for auctions (prototype openItem).

import { useNavigation } from '@react-navigation/native';
import type { Item } from '@/lib/types';
import { useHistoryStore } from '../historyStore';

export function useOpenItem(): (item: Item) => void {
  const navigation = useNavigation();
  const addRecentItem = useHistoryStore(s => s.addRecentItem);
  return item => {
    addRecentItem(item.id);
    if (item.saleType === 'auction')
      navigation.navigate('AuctionBidding', { itemId: item.id });
    else navigation.navigate('Product', { itemId: item.id });
  };
}
