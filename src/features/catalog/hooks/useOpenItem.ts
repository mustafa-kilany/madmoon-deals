// Opening a listing: remember it in "Recently viewed", count the view, then
// show the product page, or the auction page for auctions (prototype
// openItem). Always a new page, so opening a similar item from a product
// page and tapping Back returns to the item you were on.

import { StackActions, useNavigation } from '@react-navigation/native';
import type { Item } from '@/lib/types';
import { catalogService } from '@/services/catalog';
import { useHistoryStore } from '../historyStore';

export function useOpenItem(): (item: Item) => void {
  const navigation = useNavigation();
  const addRecentItem = useHistoryStore(s => s.addRecentItem);
  return item => {
    addRecentItem(item.id);
    // A missed view count isn't worth bothering the user about.
    catalogService.recordView(item.id).catch(() => {});
    navigation.dispatch(
      StackActions.push(
        item.saleType === 'auction' ? 'AuctionBidding' : 'Product',
        { itemId: item.id },
      ),
    );
  };
}
