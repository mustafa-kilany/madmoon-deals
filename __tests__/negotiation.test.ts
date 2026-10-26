import { emptyFilters } from '../src/lib/browsing';
import { calculateCheckoutBreakdown, jod } from '../src/lib/money';
import { mockCatalogService as catalog } from '../src/services/catalog/mock';
import {
  answerAsSellers,
  mockNegotiationService,
} from '../src/services/negotiation/mock';

// Without a session the mock's caller is "user-demo".

describe('Phase 5 — Negotiation & Live Auctions', () => {
  it('calculates escrow checkout fee breakdown correctly', () => {
    const offerPriceFils = jod(100); // 100 JOD = 100,000 fils
    const breakdown = calculateCheckoutBreakdown(offerPriceFils);

    expect(breakdown.itemPriceFils).toBe(100000);
    expect(breakdown.buyerProtectionFils).toBe(3000); // 3% of 100 JOD = 3 JOD
    expect(breakdown.deliveryFils).toBe(2000); // 2 JOD flat
    expect(breakdown.totalFils).toBe(105000); // 105 JOD total
  });

  it('submits a new offer and opens a chat thread with the seller', async () => {
    const result = await mockNegotiationService.makeOffer({
      itemId: 'mobiles-0',
      amountFils: jod(450),
    });

    expect(result.offer.amountFils).toBe(450000);
    expect(result.offer.status).toBe('pending');
    expect(result.offer.buyerId).toBe('user-demo');
    expect(result.offer.sellerId).toBe('user-omar');
    const thread = (await mockNegotiationService.getChatThreads()).find(
      t => t.id === result.chatId,
    );
    expect(thread?.otherPartyId).toBe('user-omar');
  });

  it('demo sellers accept offers close to the price', async () => {
    const item = await catalog.getItem('electronics-0');
    const { offer, chatId } = await mockNegotiationService.makeOffer({
      itemId: item.id,
      amountFils: item.priceFils,
    });
    answerAsSellers(Date.now() + 60_000);
    expect((await mockNegotiationService.getOffer(offer.id)).status).toBe(
      'accepted',
    );
    const messages = await mockNegotiationService.getChatMessages(chatId);
    const last = messages[messages.length - 1];
    expect(last.senderId).toBe(item.sellerId);
    expect(last.offer?.status).toBe('accepted');
  });

  it('places a bid at least one increment above the current one', async () => {
    const item = await catalog.getItem('auction-mobiles');
    const before = await mockNegotiationService.getBids(item.id);
    const amount = item.priceFils + item.auction!.incrementFils;

    const placed = await mockNegotiationService.placeBid({
      itemId: item.id,
      amountFils: amount,
    });
    expect(placed.amountFils).toBe(amount);

    const after = await mockNegotiationService.getBids(item.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after[0].id).toBe(placed.id); // newest first
    expect((await catalog.getItem(item.id)).priceFils).toBe(amount);
  });

  it('rejects a bid below the current bid plus the increment', async () => {
    const item = await catalog.getItem('auction-mobiles');
    await expect(
      mockNegotiationService.placeBid({
        itemId: item.id,
        amountFils: item.priceFils + 1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
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
    expect(newMsg.senderId).toBe('user-demo');

    const messages = await mockNegotiationService.getChatMessages(
      firstThread.id,
    );
    expect(messages.some(m => m.id === newMsg.id)).toBe(true);
  });
});

describe('Safety — report and block', () => {
  it('reports need a known reason and an existing listing', async () => {
    await mockNegotiationService.report({
      target: { type: 'listing', id: 'mobiles-0' },
      reason: 'scam',
    });
    await expect(
      mockNegotiationService.report({
        target: { type: 'listing', id: 'nope' },
        reason: 'scam',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("blocking hides that user's chats and listings until unblocked", async () => {
    const visible = async () => {
      const page = await catalog.searchListings({
        format: 'all',
        sort: 'recommended',
        filters: emptyFilters(),
        q: 'iphone 14 pro',
      });
      return page.items.some(i => i.sellerId === 'user-omar');
    };
    expect(await visible()).toBe(true);

    await mockNegotiationService.blockUser('user-omar');
    expect(await mockNegotiationService.getBlockedUsers()).toEqual([
      { id: 'user-omar', name: 'Omar' },
    ]);
    const threads = await mockNegotiationService.getChatThreads();
    expect(threads.some(t => t.otherPartyId === 'user-omar')).toBe(false);
    expect(await visible()).toBe(false);
    await expect(
      mockNegotiationService.makeOffer({
        itemId: 'mobiles-0',
        amountFils: jod(10),
      }),
    ).rejects.toMatchObject({ code: 'ITEM_UNAVAILABLE' });

    await mockNegotiationService.unblockUser('user-omar');
    expect(await visible()).toBe(true);
  });
});
