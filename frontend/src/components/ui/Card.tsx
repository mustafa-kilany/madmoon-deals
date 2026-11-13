// White surface with rounded corners and a small shadow.

import { View, type ViewProps } from 'react-native';

export function Card({ className = '', ...props }: ViewProps) {
  return (
    <View
      className={`bg-brand-surface rounded-2xl shadow-sm ${className}`}
      {...props}
    />
  );
}
