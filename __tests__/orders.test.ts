import { calculateCheckoutBreakdown, jod } from '../src/lib/money';
import { mockNegotiationService as negotiation } from '../src/services/negotiation/mock';
import { mockOrdersService as orders } from '../src/services/orders/mock';

describe('Phase 6 — orders and escrow', () => {
  it('prices an order with protection and delivery', async () => {
    const order = await orders.createOrder({ listingId: 'mobiles-0' });
    expect(order.status).toBe('awaiting_payment');
    expect(order.totalFils).toBe(
      order.itemPriceFils + order.buyerProtectionFils + order.deliveryFils,
    );
    expect(order.pin).toBeUndefined();
  });

  it('holds payment in escrow and issues a 4-digit PIN', async () => {
    const order = await orders.createOrder({ listingId: 'mobiles-0' });
    const paid = await orders.payOrder(order.id, 'mock_visa_4242');
    expect(paid.status).toBe('escrow_held');
    expect(paid.pin).toMatch(/^\d{4}$/);
    expect((await orders.getMyOrders())[0].id).toBe(order.id);
  });

  it('refuses double payment and unknown listings', async () => {
    const order = await orders.createOrder({ listingId: 'mobiles-0' });
    await orders.payOrder(order.id, 'mock_visa_4242');
    await expect(orders.payOrder(order.id, 'x')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      orders.createOrder({ listingId: 'nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('Phase 6 — accepted offers and courier confirmation', () => {
  it('charges the accepted offer price, and refuses an unaccepted one', async () => {
    const { offer } = await negotiation.makeOffer({
      itemId: 'mobiles-0',
      amountFils: jod(300),
    });
    await expect(
      orders.createOrder({ listingId: 'mobiles-0', offerId: offer.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    await negotiation.respondToOffer(offer.id, 'accepted');
    const order = await orders.createOrder({
      listingId: 'mobiles-0',
      offerId: offer.id,
    });
    expect(order.itemPriceFils).toBe(jod(300));
    expect(order.totalFils).toBe(
      calculateCheckoutBreakdown(jod(300)).totalFils,
    );

    await expect(
      orders.createOrder({ listingId: 'mobiles-1', offerId: offer.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('releases escrow only with the right PIN', async () => {
    const order = await orders.createOrder({ listingId: 'mobiles-0' });
    await expect(
      orders.confirmDelivery(order.id, '1234'),
    ).rejects.toMatchObject(
      { code: 'VALIDATION' }, // not paid yet
    );
    const { pin } = await orders.payOrder(order.id, 'mock_visa_4242');
    const wrong = pin === '0000' ? '1111' : '0000';

    await expect(orders.confirmDelivery(order.id, wrong)).rejects.toMatchObject(
      { code: 'INVALID_PIN' },
    );
    expect((await orders.getOrder(order.id)).status).toBe('escrow_held');

    const done = await orders.confirmDelivery(order.id.toLowerCase(), pin!);
    expect(done.status).toBe('completed');
    expect(done.deliveredAt).toBeDefined();
    await expect(orders.confirmDelivery(order.id, pin!)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});
