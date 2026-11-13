import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useHasEnded, useNow } from '@/hooks/useNow';

jest.useFakeTimers();

describe('shared clock', () => {
  test('useHasEnded redraws only when the auction ends', async () => {
    let renders = 0;
    const endsAt = Date.now() + 3_000;
    function Card() {
      renders++;
      return <Text>{useHasEnded(endsAt) ? 'ended' : 'live'}</Text>;
    }
    await render(<Card />);
    const before = renders;
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('live')).toBeTruthy();
    expect(renders).toBe(before); // two ticks, no redraws
    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('ended')).toBeTruthy();
  });

  test('useNow ticks every second', async () => {
    function Clock() {
      return <Text>{Math.floor(useNow() / 1000)}</Text>;
    }
    await render(<Clock />);
    const start = Number(screen.getByText(/\d+/).props.children);
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(Number(screen.getByText(/\d+/).props.children)).toBe(start + 3);
  });
});
