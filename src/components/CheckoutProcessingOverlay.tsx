import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppVideo } from './AppVideo';
import { useTheme } from '../providers/ThemeProvider';
import { blurActiveWebElement } from '../utils/webAccessibility';

interface CheckoutProcessingOverlayProps {
  visible: boolean;
}

export function CheckoutProcessingOverlay({ visible }: CheckoutProcessingOverlayProps) {
  const { theme } = useTheme();
  const [renderVisible, setRenderVisible] = useState(visible);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const frameWidth = useMemo(() => Math.max(240, Math.min(360, windowWidth - 28)), [windowWidth]);
  const frameHeight = useMemo(
    () => Math.max(280, Math.min(520, Math.min(windowHeight * 0.62, frameWidth * (16 / 9)))),
    [frameWidth, windowHeight],
  );

  useEffect(() => {
    if (visible) {
      setRenderVisible(true);
      return;
    }

    const timeout = setTimeout(() => {
      blurActiveWebElement();
      setRenderVisible(false);
    }, 140);
    return () => clearTimeout(timeout);
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible && !renderVisible) {
      return;
    }

    blurActiveWebElement();
    return () => {
      blurActiveWebElement();
    };
  }, [renderVisible, visible]);

  if (!renderVisible) {
    return null;
  }

  return (
    <Modal visible={renderVisible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.fullscreen}>
        <View style={styles.scrim} />
        <View style={styles.content}>
          <View style={[styles.videoFrame, { borderColor: theme.colors.border, width: frameWidth, height: frameHeight }]}>
            <AppVideo
              source={require('../../loading animation/checkoutanimation.mp4')}
              style={styles.video}
              contentFit="contain"
              loop
              muted={false}
              paused={!visible}
            />
          </View>
          <View style={[styles.messageCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, width: frameWidth }]}>
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
    overflow: 'hidden',
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
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  sub: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
});
