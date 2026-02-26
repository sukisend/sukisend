import { Modal, StyleSheet, Text, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';

import { useTheme } from '../providers/ThemeProvider';

interface CheckoutProcessingOverlayProps {
  visible: boolean;
}

export function CheckoutProcessingOverlay({ visible }: CheckoutProcessingOverlayProps) {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.videoWrap}>
            <Video
              source={require('../../loading animation/checkoutanimation.mp4')}
              style={styles.video}
              shouldPlay
              isLooping
              isMuted
              resizeMode={ResizeMode.CONTAIN}
            />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>Processing Checkout</Text>
          <Text style={[styles.sub, { color: theme.colors.textMuted }]}>Please wait while we confirm your order.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.55)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    width: '100%',
  },
  videoWrap: {
    borderRadius: 12,
    height: 180,
    overflow: 'hidden',
    width: '100%',
  },
  video: {
    height: '100%',
    width: '100%',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 10,
    textAlign: 'center',
  },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
