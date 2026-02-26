import { Image, StyleSheet, Text, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

import { useTheme } from '../providers/ThemeProvider';

interface BrandedLoaderProps {
  label?: string;
  compact?: boolean;
}

export function BrandedLoader({ label = 'Loading...', compact = false }: BrandedLoaderProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, compact ? styles.compact : null]}>
      <View style={[styles.videoFrame, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]}>
        <Video
          source={require('../../loading animation/loadingspinner.mp4')}
          style={styles.video}
          shouldPlay
          isLooping
          isMuted
          resizeMode={ResizeMode.CONTAIN}
        />
      </View>
      <Image source={require('../../assets/suki-send-logo.png')} style={styles.logo} resizeMode="contain" />
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
  videoFrame: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    height: 92,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 92,
  },
  video: {
    height: '100%',
    width: '100%',
  },
  logo: {
    height: 28,
    marginTop: -4,
    width: 28,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
