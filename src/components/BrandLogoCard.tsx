import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface BrandLogoCardProps {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function BrandLogoCard({
  title,
  subtitle,
  compact = false,
  style,
}: BrandLogoCardProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.card, compact ? styles.cardCompact : null, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, style]}>
      <View style={[styles.logoFrame, compact ? styles.logoFrameCompact : null, { borderColor: theme.colors.border }]}>
        <Image source={require('../../assets/suki-send-logo.png')} style={[styles.logo, compact ? styles.logoCompact : null]} resizeMode="contain" />
      </View>
      {title ? <Text style={[styles.title, compact ? styles.titleCompact : null, { color: theme.colors.text }]}>{title}</Text> : null}
      {subtitle ? (
        <Text style={[styles.subtitle, compact ? styles.subtitleCompact : null, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardCompact: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  logoFrame: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    height: 130,
    justifyContent: 'center',
    width: '100%',
  },
  logoFrameCompact: {
    height: 95,
  },
  logo: {
    height: 90,
    width: 230,
  },
  logoCompact: {
    height: 65,
    width: 180,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 14,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  subtitleCompact: {
    fontSize: 11,
  },
});
