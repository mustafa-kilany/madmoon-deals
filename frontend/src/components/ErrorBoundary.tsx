// Catches a crash while drawing the screen and shows a friendly page instead
// of closing the app: "Try again" re-draws, "Restart" reloads the whole app.
// The error goes to crashReporter.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import RNRestart from 'react-native-restart';
import { Icon } from '@/components/icons';
import { Button, Heading, Text } from '@/components/ui';
import { crashReporter } from '@/services/crashReporter';
import { colors } from '@/theme/colors';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) console.error(info.componentStack);
    crashReporter.capture(error, { where: 'render' });
  }

  render() {
    return this.state.failed ? (
      <CrashScreen onRetry={() => this.setState({ failed: false })} />
    ) : (
      this.props.children
    );
  }
}

function CrashScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="alert"
      className="flex-1 items-center justify-center gap-4 bg-brand-lightgray p-8"
    >
      <Icon name="AlertCircle" size={48} color={colors.warmgray} />
      <Heading className="text-center text-xl">{t('crash.title')}</Heading>
      <Text className="text-center text-sm text-brand-warmgray">
        {t('crash.body')}
      </Text>
      <Button label={t('common.retry')} onPress={onRetry} className="w-full" />
      <Button
        label={t('crash.restart')}
        variant="secondary"
        onPress={() => RNRestart.restart()}
        className="w-full"
      />
    </View>
  );
}
