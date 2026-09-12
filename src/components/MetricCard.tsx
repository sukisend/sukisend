import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface MetricCardProps {
  label: string;
  value: string;
  accentColor?: string;
  tintColor?: string;
  valueColor?: string;
  icon?: string;
}

const ICON_MAP: Record<string, string> = {
  'Gross Sales': 'wallet-outline',
  'Paid Orders': 'receipt-outline',
  'Profit': 'trending-up-outline',
  'Low Stock': 'alert-circle-outline',
  'Low Stock Items': 'alert-circle-outline',
  'Pending': 'time-outline',
  'Outgoing': 'paper-plane-outline',
  'Top Product': 'star-outline',
};

export function MetricCard({ label, value, accentColor, tintColor, valueColor, icon }: MetricCardProps) {
  const { theme } = useTheme();
  const accent = accentColor ?? theme.colors.primary;
  const iconName = icon ?? ICON_MAP[label] ?? 'analytics-outline';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.card, borderColor: `${accent}28` },
        theme.shadow.card,
      ]}
    >
      <View style={styles.labelRow}>
        <Ionicons name={iconName as any} size={13} color={accent} />
        <Text style={[styles.label, { color: theme.colors.textMuted }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.value, { color: valueColor ?? theme.colors.text }]} numberOfLines={2}>
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
    minHeight: 68,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '48%',
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  value: {
    fontSize: 18,
    fontWeight: '600',
  },
});
