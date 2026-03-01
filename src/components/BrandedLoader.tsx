import { useMemo } from 'react';
import { ActivityIndicator, Dimensions, Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface BrandedLoaderProps {
  label?: string;
  compact?: boolean;
}

export function BrandedLoader({ label = 'Loading...', compact = false }: BrandedLoaderProps) {
  const { theme } = useTheme();

  const frameWidth = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    const maxWidth = compact ? 170 : 220;
    return Math.max(120, Math.min(maxWidth, screenWidth - 72));
  }, [compact]);

  return (
    <View style={[styles.container, compact ? styles.compact : null]}>
      <View
        style={[
          styles.logoFrame,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceAlt,
            width: frameWidth,
            height: compact ? 120 : 156,
          },
        ]}
      >
        <Image source={require('../../assets/suki-send-logo.png')} style={styles.logo} resizeMode="contain" />
      </View>
      <ActivityIndicator size={compact ? 'small' : 'large'} color={theme.colors.primary} />
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
  logoFrame: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    height: '62%',
    width: '74%',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
