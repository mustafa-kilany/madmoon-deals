// Courier mode (BACKEND_PLAN B14.7): the deliveries list, picked up, and the
// buyer's PIN releasing the payment. The mock follows the API's rules; the
// screen is driven the way a courier would.

import { QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSessionStore } from '@/features/auth/sessionStore';
import { callUrl, mapsUrl } from '@/features/courier/links';
import { DeliveryScreen } from '@/features/courier/screens/DeliveryScreen';
import { OrderProblemScreen } from '@/features/orders/screens/OrderProblemScreen';
import { changeLanguage } from '@/i18n';
import type { DeliveryDetails } from '@/lib/types';
import type { RootScreenProps } from '@/navigation/types';
import { mockCatalogService as catalog } from '@/services/catalog/mock';
import {
  mockCourierService as courier,
  PIN_TRIES,
} from '@/services/courier/mock';
import { courierAccount, demoAccount } from '@/services/mock/users';
import { mockOrdersService as orders } from '@/services/orders/mock';
import { queryClient } from '@/services/queryClient';

// No fake network delay. The screen's service is the mock; BackButton needs
// a navigation object.
jest.mock('@/config', () => {
  const { config } = jest.requireActual('@/config');
  return { config: { ...config, mockLatencyMs: 0 } };
});
// Needs a navigator, which these screens don't have here. S6.5 is checked by the call below.
jest.mock('@/lib/secureScreen', () => ({ useSecureScreen: jest.fn() }));
jest.mock('@/services/orders', () => ({
  ordersService: jest.requireActual('@/services/orders/mock').mockOrdersService,
}));
jest.mock('@/services/courier', () => ({
  courierService: jest.requireActual('@/services/courier/mock')
    .mockCourierService,
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ canGoBack: () => true, goBack: jest.fn() }),
}));

const delivery: DeliveryDetails = {
  name: 'Ahmad',
  phone: '0791234567',
  cityId: 'amman-khalda',
  address: 'Mecca St, Building 12, 3rd floor',
};

const as = (user: typeof demoAccount) =>
  useSessionStore.setState({ user: { ...user } });

/** The demo buyer buys and pays for a listing; returns the order and its PIN. */
async function paidOrder(listingId: string) {
  as(demoAccount);
  const order = await orders.createOrder({ listingId, delivery });
  const { pin } = await orders.payOrder(order.id, 'mock_visa_4242');
  as(courierAccount);
  return { orderId: order.id, pin: pin! };
}

const wrongPin = (pin: string) => (pin === '0000' ? '1111' : '0000');

beforeEach(async () => {
  await changeLanguage('en');
});

describe('courier service (mock)', () => {
  it('only couriers see deliveries', async () => {
    as(demoAccount);
    await expect(courier.getDeliveries()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('lists a paid order, then picked up, then the right PIN completes it', async () => {
    const { orderId, pin } = await paidOrder('kids-0');
    const listed = (await courier.getDeliveries()).find(
      d => d.orderId === orderId,
    );
    expect(listed).toMatchObject({ status: 'to_pickup', dropoff: delivery });
    expect(listed!.pickup.address).not.toBe('');

    const picked = await courier.markPickedUp(orderId.toLowerCase());
    expect(picked.status).toBe('picked_up');
    expect(picked.pickedUpAt).toBeDefined();
    await expect(courier.markPickedUp(orderId)).rejects.toMatchObject({
      code: 'VALIDATION',
    });

    await expect(
      courier.confirmDelivery(orderId, wrongPin(pin)),
    ).rejects.toMatchObject({ code: 'INVALID_PIN' });
    as(demoAccount);
    expect((await orders.getOrder(orderId)).status).toBe('escrow_held');
    as(courierAccount);

    const done = await courier.confirmDelivery(orderId, pin);
    expect(done.status).toBe('completed');
    expect((await catalog.getItem('kids-0')).status).toBe('sold');
    // Delivered today: still in the list, marked delivered.
    expect(
      (await courier.getDeliveries()).find(d => d.orderId === orderId)?.status,
    ).toBe('delivered');
    await expect(courier.confirmDelivery(orderId, pin)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('locks after five wrong PINs, even for the right one', async () => {
    const { orderId, pin } = await paidOrder('hobbies-0');
    for (let i = 0; i < PIN_TRIES; i++)
      await expect(
        courier.confirmDelivery(orderId, wrongPin(pin)),
      ).rejects.toMatchObject({ code: 'INVALID_PIN' });
    await expect(courier.confirmDelivery(orderId, pin)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('unpaid orders are not deliveries', async () => {
    as(demoAccount);
    const order = await orders.createOrder({
      listingId: 'appliances-1',
      delivery,
    });
    as(courierAccount);
    expect(
      (await courier.getDeliveries()).some(d => d.orderId === order.id),
    ).toBe(false);
    await expect(courier.markPickedUp(order.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('courier links', () => {
  it('calls the number, or nothing without one', () => {
    expect(callUrl('079 123 4567')).toBe('tel:0791234567');
    expect(callUrl('+962791234567')).toBe('tel:+962791234567');
    expect(callUrl('')).toBeNull();
  });

  it('searches the address in its area in the maps app', () => {
    const url = mapsUrl(delivery, 'Khalda, Amman');
    expect(url).toMatch(
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/,
    );
    expect(decodeURIComponent(url.split('query=')[1])).toBe(
      'Mecca St, Building 12, 3rd floor, Khalda, Amman, Jordan',
    );
    // No address yet (pickup not given): just the area.
    expect(
      decodeURIComponent(
        mapsUrl({ ...delivery, address: ' ' }, 'Khalda, Amman').split(
          'query=',
        )[1],
      ),
    ).toBe('Khalda, Amman, Jordan');
  });
});

describe('DeliveryScreen', () => {
  // Finished button presses (mutations) are kept 5 min by default, on a timer
  // clear() doesn't stop; with 0 and the cache cleared, Jest can exit.
  beforeAll(() =>
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      mutations: { gcTime: 0 },
    }),
  );
  afterEach(async () => {
    await cleanup();
    queryClient.clear();
  });
  // Without a size the safe-area provider renders nothing.
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };
  const show = (orderId: string) =>
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={queryClient}>
          <DeliveryScreen
            {...({
              route: { key: 'Delivery', name: 'Delivery', params: { orderId } },
              navigation: {},
            } as unknown as RootScreenProps<'Delivery'>)}
          />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

  it('picked up → a wrong PIN is refused → the right PIN confirms', async () => {
    const { orderId, pin } = await paidOrder('furniture-0');
    await show(orderId);
    const timeout = { timeout: 3000 };

    expect(await screen.findByText('Ahmad', {}, timeout)).toBeTruthy();
    expect(screen.getByText(delivery.address)).toBeTruthy();
    // Nothing to type before the item is collected.
    expect(screen.queryByLabelText('Delivery PIN')).toBeNull();

    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Call' })[1]);
    expect(open).toHaveBeenCalledWith('tel:0791234567');

    await fireEvent.press(
      screen.getByRole('button', { name: 'I Picked It Up' }),
    );
    const pinField = await screen.findByLabelText('Delivery PIN', {}, timeout);
    const confirm = screen.getByRole('button', { name: 'Confirm Delivery' });
    expect(confirm).toBeDisabled();

    await fireEvent.changeText(pinField, wrongPin(pin));
    await fireEvent.press(confirm);
    expect(
      await screen.findByText(/doesn't match this order/, {}, timeout),
    ).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Delivery PIN'), pin);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Confirm Delivery' }),
    );
    expect(
      await screen.findByText(/Payment released to the seller/, {}, timeout),
    ).toBeTruthy();
  }, 15_000);
});

describe('OrderProblemScreen (B15.4)', () => {
  afterEach(async () => {
    await cleanup();
    queryClient.clear();
  });
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };

  it('the driver marks a pickup failed: pickup reasons only, "other" needs a note', async () => {
    const { orderId } = await paidOrder('furniture-1');
    const goBack = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={queryClient}>
          <OrderProblemScreen
            {...({
              route: {
                key: 'OrderProblem',
                name: 'OrderProblem',
                params: { kind: 'deliveryFailed', orderId, stage: 'pickup' },
              },
              navigation: { goBack },
            } as unknown as RootScreenProps<'OrderProblem'>)}
          />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Why couldn’t you pick it up?')).toBeTruthy();
    expect(screen.getByText('The seller wasn’t there')).toBeTruthy();
    expect(screen.queryByText('The buyer wasn’t there')).toBeNull();

    const submit = screen.getByRole('button', { name: 'MARK AS FAILED' });
    expect(submit).toBeDisabled();
    await fireEvent.press(screen.getByText('Another reason'));
    expect(submit).toBeDisabled();
    expect(screen.getByText('Please say what happened.')).toBeTruthy();
    await fireEvent.press(screen.getByText('The seller wasn’t there'));
    await fireEvent.press(
      screen.getByRole('button', { name: 'MARK AS FAILED' }),
    );
    await waitFor(() => expect(goBack).toHaveBeenCalled());

    const [failed] = (await courier.getDeliveries()).filter(
      d => d.orderId === orderId,
    );
    expect(failed.status).toBe('failed');
    expect(failed.failed).toMatchObject({
      stage: 'pickup',
      reason: 'seller_unavailable',
    });
  }, 15_000);
});
