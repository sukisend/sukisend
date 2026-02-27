import { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';

import { AppVideo } from './AppVideo';
import { useTheme } from '../providers/ThemeProvider';

interface CheckoutProcessingOverlayProps {
  visible: boolean;
}

export function CheckoutProcessingOverlay({ visible }: CheckoutProcessingOverlayProps) {
  const { theme } = useTheme();
  const [renderVisible, setRenderVisible] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRenderVisible(true);
      return;
    }

    const timeout = setTimeout(() => setRenderVisible(false), 140);
    return () => clearTimeout(timeout);
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    const activeElement = document.activeElement as { blur?: () => void } | null;
    activeElement?.blur?.();
  }, [visible]);

  if (!renderVisible) {
    return null;
  }

  return (
    <Modal visible={renderVisible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.fullscreen}>
        <View style={styles.scrim} />
        <View style={styles.content}>
          <View style={[styles.videoFrame, { borderColor: theme.colors.border }]}>
            <AppVideo
              source={require('../../loading animation/checkoutanimation.mp4')}
              style={styles.video}
              contentFit="cover"
              loop
              muted
              paused={!visible}
            />
          </View>
          <View style={[styles.messageCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Processing Checkout</Text>
            <Text style={[styles.sub, { color: theme.colors.textMuted }]}>Placing your COD order...</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    alignItems: 'center',
    backgroundColor: '#020617',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  videoFrame: {
    backgroundColor: '#020617',
    borderRadius: 22,
    borderWidth: 1,
    height: '64%',
    maxHeight: 540,
    maxWidth: 360,
    minHeight: 300,
    overflow: 'hidden',
    width: '90%',
  },
  video: {
    height: '100%',
    width: '100%',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.38)',
  },
  messageCard: {
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    maxWidth: 360,
    paddingHorizontal: 18,
    paddingVertical: 14,
    width: '90%',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  sub: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
});
