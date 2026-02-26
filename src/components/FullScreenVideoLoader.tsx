import { ResizeMode, Video } from 'expo-av';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface FullScreenVideoLoaderProps {
  visible: boolean;
  label?: string;
  message?: string;
}

export function FullScreenVideoLoader({
  visible,
  label = 'Loading SUKI SEND',
  message = 'Please wait while we prepare your experience.',
}: FullScreenVideoLoaderProps) {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.videoWrap}>
            <Video
              source={require('../../loading animation/loadingspinner.mp4')}
              style={styles.video}
              shouldPlay
              isLooping
              isMuted
              resizeMode={ResizeMode.CONTAIN}
            />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>{label}</Text>
          <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: '100%',
  },
  videoWrap: {
    borderRadius: 14,
    height: 260,
    overflow: 'hidden',
    width: '100%',
  },
  video: {
    height: '100%',
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center',
  },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'center',
  },
});
