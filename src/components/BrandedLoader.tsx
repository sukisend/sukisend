import { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { AppVideo } from './AppVideo';
import { useTheme } from '../providers/ThemeProvider';

interface BrandedLoaderProps {
  label?: string;
  compact?: boolean;
}

export function BrandedLoader({ label = 'Loading...', compact = false }: BrandedLoaderProps) {
  const { theme } = useTheme();

  const frameWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const maxWidth = compact ? 172 : 242;
    return Math.max(132, Math.min(maxWidth, screenWidth - 72));
  }, [compact]);

  return (
    <View style={[styles.container, compact ? styles.compact : null]}>
      <View
        style={[
          styles.videoFrame,
          {
            borderColor: theme.colors.primary,
            backgroundColor: theme.colors.surface,
            width: frameWidth,
            minHeight: compact ? 128 : 182,
          },
        ]}
      >
        <AppVideo
          source={require('../../loading animation/loadingspinner.mp4')}
          style={styles.video}
          contentFit="contain"
          loop
          muted
        />
      </View>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  compact: {
    paddingVertical: 8,
  },
  videoFrame: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  video: {
    height: '100%',
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
