import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface ThemeModeToggleProps {
  compact?: boolean;
}

export function ThemeModeToggle({ compact = false }: ThemeModeToggleProps) {
  const { theme, mode, toggleTheme } = useTheme();
  const isDark = mode === 'dark';

  return (
    <Pressable
      onPress={toggleTheme}
      style={[
        styles.wrapper,
        compact ? styles.wrapperCompact : null,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
      ]}
    >
      <View style={[styles.track, { backgroundColor: isDark ? '#111111' : '#D4D4D4' }]}>
        <View style={[styles.thumb, isDark ? styles.thumbRight : styles.thumbLeft, { backgroundColor: '#FFFFFF' }]} />
      </View>
      <Text style={[styles.label, { color: theme.colors.text }]}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  wrapperCompact: {
    minWidth: 106,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  track: {
    borderRadius: 999,
    height: 28,
    width: 62,
  },
  thumb: {
    borderRadius: 999,
    height: 24,
    marginTop: 2,
    width: 24,
  },
  thumbLeft: {
    marginLeft: 2,
  },
  thumbRight: {
    marginLeft: 36,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 5,
  },
});
