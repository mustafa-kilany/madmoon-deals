// UI kit components: what the user sees and can press, including what a
// screen reader announces (role, label, state).

import { fireEvent, render, screen } from '@testing-library/react-native';
import { changeLanguage } from '@/i18n';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Price } from '@/components/Price';
import { ReadMoreText } from '@/components/ReadMoreText';
import { StatusView } from '@/components/StatusView';
import { Button, Chip, Text, TextField } from '@/components/ui';
import { crashReporter } from '@/services/crashReporter';

beforeEach(async () => {
  await changeLanguage('en');
});

describe('Button', () => {
  test('presses, and announces itself as a button with its label', async () => {
    const onPress = jest.fn();
    await render(<Button label="Pay now" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pay now' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('loading: busy, and presses are ignored', async () => {
    const onPress = jest.fn();
    await render(<Button label="Pay now" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Pay now' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('disabled presses are ignored', async () => {
    const onPress = jest.fn();
    await render(<Button label="Next" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

test('Chip reports whether it is selected', async () => {
  const onPress = jest.fn();
  await render(<Chip label="Salt" selected onPress={onPress} />);
  const chip = screen.getByRole('button', { name: 'Salt' });
  expect(chip).toBeSelected();
  await fireEvent.press(chip);
  expect(onPress).toHaveBeenCalled();
});

test('TextField: label, typing, and the error message', async () => {
  const onChangeText = jest.fn();
  await render(
    <TextField
      label="Email Address"
      value=""
      onChangeText={onChangeText}
      error="Enter a valid email"
    />,
  );
  await fireEvent.changeText(screen.getByLabelText('Email Address'), 'a@b.co');
  expect(onChangeText).toHaveBeenCalledWith('a@b.co');
  expect(screen.getByText('Enter a valid email')).toBeOnTheScreen();
});

test('TextField: hint and character count; an error replaces the hint', async () => {
  const field = (error?: string) => (
    <TextField
      label="Description"
      value="Like new"
      maxLength={2000}
      showCount
      hint="Buyers see this"
      error={error}
    />
  );
  await render(field());
  expect(screen.getByText('Buyers see this')).toBeOnTheScreen();
  expect(screen.getByText('8 / 2000')).toBeOnTheScreen();

  await screen.rerender(field('Too long'));
  expect(screen.queryByText('Buyers see this')).not.toBeOnTheScreen();
  expect(screen.getByText('Too long')).toBeOnTheScreen();
  expect(screen.getByText('8 / 2000')).toBeOnTheScreen();
});

describe('ReadMoreText', () => {
  const text = 'Battery 89%, box and cable included.';
  // The invisible full copy reports how many lines the whole text takes.
  const layout = (lines: number) =>
    fireEvent(
      screen.getAllByText(text, { includeHiddenElements: true })[0],
      'textLayout',
      { nativeEvent: { lines: Array.from({ length: lines }, () => ({})) } },
    );

  test('short text: shown in full, no link', async () => {
    await render(<ReadMoreText text={text} />);
    await layout(3);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  test('long text: cut to 5 lines, Read more opens it, Show less closes it', async () => {
    await render(<ReadMoreText text={text} />);
    await layout(9);
    expect(screen.getByText(text).props.numberOfLines).toBe(5);

    await fireEvent.press(screen.getByRole('button', { name: 'Read more' }));
    expect(screen.getByText(text).props.numberOfLines).toBeUndefined();

    await fireEvent.press(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getByText(text).props.numberOfLines).toBe(5);
  });
});

// The amount is wrapped in left-to-right marks (U+2066…U+2069) so it reads
// correctly inside Arabic text; match the whole price around them.
const price = (amount: string, unit: string) =>
  new RegExp(`^\u2066${amount.replace('.', '\\.')}\u2069 ${unit}$`);

describe('Price', () => {
  test('amount with the unit for the language', async () => {
    await render(<Price fils={780_000} />);
    expect(screen.getByText(price('780', 'JOD'))).toBeOnTheScreen();
  });

  test('Arabic unit', async () => {
    await changeLanguage('ar');
    await render(<Price fils={780_000} />);
    expect(screen.getByText(price('780', 'د.أ'))).toBeOnTheScreen();
  });

  test('fils show as decimals', async () => {
    await render(<Price fils={12_500} />);
    expect(screen.getByText(price('12.500', 'JOD'))).toBeOnTheScreen();
  });
});

test('StatusView error retries', async () => {
  const onRetry = jest.fn();
  await render(<StatusView status="error" onRetry={onRetry} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalled();
});

describe('ErrorBoundary', () => {
  let broken = true;
  function Fragile() {
    if (broken) throw new Error('render failed');
    return <Text>Recovered</Text>;
  }

  test('a crash shows the friendly page and is reported; Try again re-draws', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    await render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    expect(crashReporter.recent()[0]).toMatchObject({
      message: 'render failed',
      context: { where: 'render' },
    });

    broken = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Recovered')).toBeOnTheScreen();
    quiet.mockRestore();
  });
});
