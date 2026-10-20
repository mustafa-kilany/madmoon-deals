import { mockOrdersService as orders } from '../src/services/orders/mock';

describe('Phase 6 — orders and escrow', () => {
  it('prices an order with protection and delivery', async () => {
    const order = await orders.createOrder({ listingId: 'tech-0' });
    expect(order.status).toBe('awaiting_payment');
    expect(order.totalFils).toBe(
      order.itemPriceFils + order.buyerProtectionFils + order.deliveryFils,
    );
    expect(order.pin).toBeUndefined();
  });

  it('holds payment in escrow and issues a 4-digit PIN', async () => {
    const order = await orders.createOrder({ listingId: 'tech-0' });
    const paid = await orders.payOrder(order.id, 'mock_visa_4242');
    expect(paid.status).toBe('escrow_held');
    expect(paid.pin).toMatch(/^\d{4}$/);
    expect((await orders.getMyOrders())[0].id).toBe(order.id);
  });

  it('refuses double payment and unknown listings', async () => {
    const order = await orders.createOrder({ listingId: 'tech-0' });
    await orders.payOrder(order.id, 'mock_visa_4242');
    await expect(orders.payOrder(order.id, 'x')).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      orders.createOrder({ listingId: 'nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
