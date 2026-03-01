import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface MetricCardProps {
  label: string;
  value: string;
  accentColor?: string;
  tintColor?: string;
  valueColor?: string;
}

export function MetricCard({ label, value, accentColor, tintColor, valueColor }: MetricCardProps) {
  const { theme } = useTheme();
  const accent = accentColor ?? theme.colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: tintColor ?? theme.colors.card, borderColor: accent }]}>
      <View style={[styles.accentLine, { backgroundColor: accent }]} />
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor ?? accent }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    minHeight: 85,
    overflow: 'hidden',
    padding: 12,
    width: '48%',
  },
  accentLine: {
    borderRadius: 99,
    height: 4,
    marginBottom: 4,
    width: 34,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    fontSize: 16,
    fontWeight: '800',
  },
});
