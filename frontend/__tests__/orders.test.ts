import { calculateCheckoutBreakdown, jod } from '../src/lib/money';
import type { DeliveryDetails } from '../src/lib/types';
import { mockCatalogService as catalog } from '../src/services/catalog/mock';
import {
  answerAsSellers,
  mockNegotiationService as negotiation,
} from '../src/services/negotiation/mock';
import { mockOrdersService as orders } from '../src/services/orders/mock';

// Mock state lives for the whole file, so each test buys its own listing.
// Without a session the mock's caller is "user-demo"; seed listings belong to
// demo sellers (mobiles-0 → user-omar).

const delivery: DeliveryDetails = {
  name: 'Ahmad',
  phone: '+962 79 123 4567',
  cityId: 'amman-khalda',
  address: 'Mecca St, Building 12, 3rd floor',
};

describe('Phase 6 — orders and escrow', () => {
  it('prices an order with protection and delivery, and keeps the address', async () => {
    const order = await orders.createOrder({
      listingId: 'mobiles-0',
      delivery,
    });
    expect(order.status).toBe('awaiting_payment');
    expect(order.totalFils).toBe(
      order.itemPriceFils + order.buyerProtectionFils + order.deliveryFils,
    );
    expect(order.pin).toBeUndefined();
    expect(order.delivery.phone).toBe('0791234567');
  });

  it('needs complete delivery details', async () => {
    await expect(
      orders.createOrder({
        listingId: 'mobiles-0',
        delivery: { ...delivery, phone: '12345' },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('holds payment in escrow, issues a PIN and reserves the listing', async () => {
    const order = await orders.createOrder({
      listingId: 'mobiles-1',
      delivery,
    });
    const paid = await orders.payOrder(order.id, 'mock_visa_4242');
    expect(paid.status).toBe('escrow_held');
    expect(paid.pin).toMatch(/^\d{4}$/);
    expect((await orders.getMyOrders())[0].id).toBe(order.id);
    expect((await catalog.getItem('mobiles-1')).status).toBe('reserved');
  });

  it('sells a listing once', async () => {
    const first = await orders.createOrder({
      listingId: 'mobiles-2',
      delivery,
    });
    const second = await orders.createOrder({
      listingId: 'mobiles-2',
      delivery,
    });
    await orders.payOrder(first.id, 'mock_visa_4242');
    await expect(
      orders.payOrder(second.id, 'mock_visa_4242'),
    ).rejects.toMatchObject({ code: 'ITEM_UNAVAILABLE' });
    await expect(
      orders.createOrder({ listingId: 'mobiles-2', delivery }),
    ).rejects.toMatchObject({ code: 'ITEM_UNAVAILABLE' });
    await expect(
      orders.payOrder(first.id, 'mock_visa_4242'),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      orders.createOrder({ listingId: 'nope', delivery }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses buying your own listing', async () => {
    const mine = await catalog.createListing({
      category: 'mobiles',
      titleAr: 'كفر هاتف',
      titleEn: 'Phone case',
      priceFils: jod(100),
      imageUrls: ['file:///p.jpg'],
      condition: 'good',
      description:
        'A clear silicone case, used for two months, with no cracks or yellowing.',
      type: 'accessories',
      locationId: 'salt',
      saleType: 'fixed',
      pickup: { phone: '0791234567', address: 'Main St, building 1' },
    });
    expect(mine.sellerId).toBe('user-demo');
    await expect(
      orders.createOrder({ listingId: mine.id, delivery }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Phase 6 — offers and counters', () => {
  it('only the seller answers a pending offer; the buyer answers a counter', async () => {
    const { offer } = await negotiation.makeOffer({
      itemId: 'mobiles-3',
      amountFils: jod(1),
    });
    expect(offer.sellerId).not.toBe(offer.buyerId);
    await expect(
      negotiation.respondToOffer(offer.id, 'accepted'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      orders.createOrder({
        listingId: 'mobiles-3',
        offerId: offer.id,
        delivery,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    // The demo seller counters a low offer halfway.
    answerAsSellers(Date.now() + 60_000);
    const countered = await negotiation.getOffer(offer.id);
    expect(countered.status).toBe('countered');
    expect(countered.counterAmountFils).toBeGreaterThan(jod(1));

    const accepted = await negotiation.respondToOffer(offer.id, 'accepted');
    expect(accepted.amountFils).toBe(countered.counterAmountFils);

    const order = await orders.createOrder({
      listingId: 'mobiles-3',
      offerId: offer.id,
      delivery,
    });
    expect(order.itemPriceFils).toBe(accepted.amountFils);
    expect(order.totalFils).toBe(
      calculateCheckoutBreakdown(accepted.amountFils).totalFils,
    );
    await expect(
      orders.createOrder({
        listingId: 'fashion-0',
        offerId: offer.id,
        delivery,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('an ended auction sells only to its winner, at the winning bid', async () => {
    const item = await catalog.getItem('auction-electronics');
    await expect(
      orders.createOrder({ listingId: item.id, delivery }),
    ).rejects.toMatchObject({ code: 'ITEM_UNAVAILABLE' }); // still running

    const bid = item.priceFils + item.auction!.incrementFils;
    await negotiation.placeBid({ itemId: item.id, amountFils: bid });

    const later = item.auction!.endsAt + 1000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(later);
    try {
      expect((await catalog.getItem(item.id)).auction?.winnerId).toBe(
        'user-demo',
      );
      const order = await orders.createOrder({ listingId: item.id, delivery });
      expect(order.itemPriceFils).toBe(bid);
    } finally {
      now.mockRestore();
    }
  });
});
