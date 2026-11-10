// BACKEND_REVIEW M3: the app tells the server its build, and a server that says "too old" (426)
// gets only the update screen, which opens the store.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { UpdateRequiredScreen } from '@/components/UpdateRequiredScreen';
import { config } from '@/config';
import { changeLanguage } from '@/i18n';
import { api, setUpdateRequiredHandler } from '@/services/api/client';
import { ApiError, errorMessageKey } from '@/services/api/errors';
import { useUiStore } from '@/store/uiStore';

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;
const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  });

beforeEach(async () => {
  fetchMock.mockReset();
  await changeLanguage('en');
});

test('the build number is the same as versionCode in build.gradle', () => {
  const gradle = readFileSync(
    path.join(__dirname, '../android/app/build.gradle'),
    'utf8',
  );
  const versionCode = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
  expect(config.appBuild).toBe(versionCode);
});

test('every request says which build it is', async () => {
  respond(200, {});
  await api.get('/categories');
  expect(fetchMock.mock.calls[0][1].headers['X-App-Build']).toBe(
    String(config.appBuild),
  );
});

test('426 UPDATE_REQUIRED: the update screen takes over, and the error has its own message', async () => {
  const handler = jest.fn();
  setUpdateRequiredHandler(handler);
  respond(426, { error: { code: 'UPDATE_REQUIRED', message: 'too old' } });
  const error = await api.get('/me').catch((e: unknown) => e as ApiError);
  expect(handler).toHaveBeenCalledTimes(1);
  expect((error as ApiError).code).toBe('UPDATE_REQUIRED');
  expect(errorMessageKey(error)).toBe('errors.UPDATE_REQUIRED');

  // Other failures don't.
  respond(500);
  await api.get('/me').catch(() => {});
  expect(handler).toHaveBeenCalledTimes(1);
});

test('the store flag the app root watches', () => {
  expect(useUiStore.getState().updateRequired).toBe(false);
  useUiStore.getState().requireUpdate();
  expect(useUiStore.getState().updateRequired).toBe(true);
});

test('the update screen says why and opens Google Play', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await render(<UpdateRequiredScreen />);
  expect(screen.getByText('Time to update Sahla')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Update' }));
  expect(open).toHaveBeenCalledWith('market://details?id=com.sahla');
});
