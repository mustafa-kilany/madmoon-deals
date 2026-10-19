import { calculateCheckoutBreakdown, jod } from '../src/lib/money';
import { mockNegotiationService } from '../src/services/negotiation/mock';

describe('Phase 5 — Negotiation & Live Auctions', () => {
  it('calculates escrow checkout fee breakdown correctly', () => {
    const offerPriceFils = jod(100); // 100 JOD = 100,000 fils
    const breakdown = calculateCheckoutBreakdown(offerPriceFils);

    expect(breakdown.itemPriceFils).toBe(100000);
    expect(breakdown.buyerProtectionFils).toBe(3000); // 3% of 100 JOD = 3 JOD
    expect(breakdown.deliveryFils).toBe(2000); // 2 JOD flat
    expect(breakdown.totalFils).toBe(105000); // 105 JOD total
  });

  it('submits a new offer and opens a chat thread', async () => {
    const result = await mockNegotiationService.makeOffer({
      itemId: 'tech-0',
      amountFils: jod(450),
    });

    expect(result.offer).toBeDefined();
    expect(result.offer.amountFils).toBe(450000);
    expect(result.offer.status).toBe('pending');
    expect(result.chatId).toBeDefined();
  });

  it('places a valid live bid on an auction item', async () => {
    const initialBids = await mockNegotiationService.getBids('auction-tech');
    const initialCount = initialBids.length;
    const highestBid = initialBids[initialCount - 1]?.amountFils ?? 500000;

    const newBidAmount = highestBid + 10000; // +10 JOD
    const placedBid = await mockNegotiationService.placeBid({
      itemId: 'auction-tech',
      amountFils: newBidAmount,
    });

    expect(placedBid.amountFils).toBe(newBidAmount);

    const updatedBids = await mockNegotiationService.getBids('auction-tech');
    expect(updatedBids.length).toBe(initialCount + 1);
  });

  it('rejects a bid that is lower than or equal to current highest bid', async () => {
    await expect(
      mockNegotiationService.placeBid({
        itemId: 'auction-tech',
        amountFils: 1000, // too low
      }),
    ).rejects.toThrow();
  });

  it('sends and retrieves chat messages', async () => {
    const threads = await mockNegotiationService.getChatThreads();
    expect(threads.length).toBeGreaterThan(0);

    const firstThread = threads[0];
    const newMsg = await mockNegotiationService.sendMessage({
      chatId: firstThread.id,
      text: 'Hello, is this item available?',
    });

    expect(newMsg.text).toBe('Hello, is this item available?');

    const messages = await mockNegotiationService.getChatMessages(firstThread.id);
    expect(messages.some(m => m.id === newMsg.id)).toBe(true);
  });
});
