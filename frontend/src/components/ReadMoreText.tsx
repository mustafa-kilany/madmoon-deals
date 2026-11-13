// Long text cut to a few lines with "Read more" / "Show less" (the listing
// description on the item page). Short text shows in full, without the link.

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';

type ReadMoreTextProps = {
  text: string;
  /** Lines shown while collapsed. */
  lines?: number;
  className?: string;
};

export function ReadMoreText({
  text,
  lines = 5,
  className = '',
}: ReadMoreTextProps) {
  const { t } = useTranslation();
  const [fullLines, setFullLines] = useState(0);
  const [expanded, setExpanded] = useState(false);

  return (
    <View>
      {/* Invisible full copy: tells how many lines the whole text takes. */}
      <Text
        className={`absolute inset-x-0 top-0 opacity-0 ${className}`}
        onTextLayout={e => setFullLines(e.nativeEvent.lines.length)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {text}
      </Text>
      <Text className={className} numberOfLines={expanded ? undefined : lines}>
        {text}
      </Text>
      {fullLines > lines && (
        <Pressable
          onPress={() => setExpanded(v => !v)}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-1 min-h-11 justify-center self-start"
        >
          <Text className="font-sans-bold text-sm text-brand-primary">
            {t(expanded ? 'common.showLess' : 'common.readMore')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
