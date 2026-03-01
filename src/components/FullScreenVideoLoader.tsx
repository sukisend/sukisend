import { ActivityIndicator, Image, Modal, StyleSheet, Text, View } from 'react-native';

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
          <View style={[styles.logoWrap, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
            <Image source={require('../../assets/suki-send-logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.spinner} />
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
  logoWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 170,
    width: '100%',
  },
  logo: {
    height: 112,
    width: '70%',
  },
  spinner: {
    marginTop: 12,
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
