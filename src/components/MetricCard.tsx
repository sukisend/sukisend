import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface MetricCardProps {
  label: string;
  value: string;
}

export function MetricCard({ label, value }: MetricCardProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    minHeight: 85,
    padding: 12,
    width: '48%',
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
