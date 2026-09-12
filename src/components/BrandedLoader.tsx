import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface BrandedLoaderProps {
  label?: string;
  compact?: boolean;
}

export function BrandedLoader({ label = 'Loading...', compact = false }: BrandedLoaderProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, compact ? styles.compact : null]}>
      <ActivityIndicator size={compact ? 'small' : 'large'} color={theme.colors.primary} />
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  compact: {
    paddingVertical: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
