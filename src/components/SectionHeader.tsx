import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';
import { ThemeModeToggle } from './ThemeModeToggle';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  showThemeToggle?: boolean;
}

export function SectionHeader({ title, subtitle, showThemeToggle = true }: SectionHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {showThemeToggle ? <ThemeModeToggle compact /> : null}
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
});
