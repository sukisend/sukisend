import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';
import { SalesRangePreset } from '../types/models';

interface RangeChipsProps {
  value: SalesRangePreset;
  onChange: (value: SalesRangePreset) => void;
}

const PRESETS: { label: string; value: SalesRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: '3 Months', value: '3months' },
  { label: '6 Months', value: '6months' },
  { label: 'Year', value: 'year' },
  { label: 'Custom', value: 'custom' },
];

export function RangeChips({ value, onChange }: RangeChipsProps) {
  const { theme } = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {PRESETS.map((preset) => {
        const active = preset.value === value;
        return (
          <Pressable
            key={preset.value}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
              },
            ]}
            onPress={() => onChange(preset.value)}
          >
            <Text style={[styles.text, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
              {preset.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
