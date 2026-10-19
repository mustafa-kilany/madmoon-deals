// Toast stack (prototype components/Toast): espresso pill above the bottom
// nav with a round status icon. Tap to dismiss early. Rendered once in App.

import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { useToastStore } from '@/store/toastStore';
import { colors } from '@/theme/colors';

export function Toast() {
  const toasts = useToastStore(s => s.toasts);
  const dismiss = useToastStore(s => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-24 z-50 items-center gap-2 px-6"
    >
      {toasts.map(toast => (
        <Animated.View
          key={toast.id}
          entering={FadeInDown}
          exiting={FadeOut}
          style={styles.toast}
        >
          <Pressable
            onPress={() => dismiss(toast.id)}
            accessibilityRole="alert"
            className="flex-row items-center gap-3 rounded-2xl bg-brand-espresso px-4 py-3 shadow-xl"
          >
            <View
              className={`h-6 w-6 items-center justify-center rounded-full ${
                toast.tone === 'success'
                  ? 'bg-brand-success'
                  : 'bg-brand-secondary'
              }`}
            >
              <Icon
                name={toast.tone === 'success' ? 'Check' : 'Heart'}
                size={toast.tone === 'success' ? 16 : 14}
                color={
                  toast.tone === 'success' ? colors.onPrimary : colors.espresso
                }
              />
            </View>
            <Text className="flex-1 font-sans-bold text-sm text-brand-on-primary">
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

// Reanimated views take style, not className.
const styles = StyleSheet.create({ toast: { width: '100%', maxWidth: 340 } });
