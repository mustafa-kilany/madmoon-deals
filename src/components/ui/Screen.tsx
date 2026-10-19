// Page container: warm cream background, safe-area padding at the top (the
// prototype's pt-12 status-bar gap), and an optional white header bar.

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScreenProps = {
  /** Header content (back button, title, actions); rendered on a white bar. */
  header?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function Screen({ header, children, className = '' }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View className={`flex-1 bg-brand-lightgray ${className}`}>
      <View
        className={header ? 'bg-brand-surface' : ''}
        style={{ paddingTop: insets.top }}
      >
        {header && (
          <View className="min-h-14 flex-row items-center gap-3 px-5 pb-4 pt-3">
            {header}
          </View>
        )}
      </View>
      {children}
    </View>
  );
}
