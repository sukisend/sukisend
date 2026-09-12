import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  size?: 'small' | 'medium';
  disabled?: boolean;
}

export function QuantityStepper({ value, min = 1, max = 999, onChange, size = 'medium', disabled }: QuantityStepperProps) {
  const { theme } = useTheme();
  const isSmall = size === 'small';
  const btnSize = isSmall ? 28 : 34;
  const iconSize = isSmall ? 14 : 16;
  const fontSize = isSmall ? 13 : 15;

  return (
    <View style={styles.row}>
      <Pressable
        style={[
          styles.btn,
          {
            backgroundColor: theme.colors.surfaceAlt,
            height: btnSize,
            width: btnSize,
            opacity: value <= min || disabled ? 0.4 : 1,
          },
        ]}
        disabled={value <= min || disabled}
        onPress={() => onChange(Math.max(min, value - 1))}
      >
        <Ionicons name="remove" size={iconSize} color={theme.colors.text} />
      </Pressable>
      <Text style={[styles.value, { color: theme.colors.text, fontSize }]}>{value}</Text>
      <Pressable
        style={[
          styles.btn,
          {
            backgroundColor: theme.colors.surfaceAlt,
            height: btnSize,
            width: btnSize,
            opacity: value >= max || disabled ? 0.4 : 1,
          },
        ]}
        disabled={value >= max || disabled}
        onPress={() => onChange(Math.min(max, value + 1))}
      >
        <Ionicons name="add" size={iconSize} color={theme.colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  btn: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
  },
  value: {
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'center',
  },
});
