import { Modal, StyleSheet, Text, View } from 'react-native';

import { AppVideo } from './AppVideo';
import { ModalBackdrop } from './ModalBackdrop';
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
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <ModalBackdrop>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={[styles.videoWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
            <AppVideo
              source={require('../../loading animation/loadingspinner.mp4')}
              style={styles.video}
              contentFit="contain"
              loop
              muted
              paused={!visible}
            />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>{label}</Text>
          <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{message}</Text>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 360,
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: '100%',
  },
  videoWrap: {
    alignSelf: 'center',
    backgroundColor: '#020617',
    borderRadius: 14,
    minHeight: 212,
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
