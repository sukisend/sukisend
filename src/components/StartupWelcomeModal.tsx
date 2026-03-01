import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';
import { ModalBackdrop } from './ModalBackdrop';

interface StartupWelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function StartupWelcomeModal({ visible, onClose }: StartupWelcomeModalProps) {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <ModalBackdrop overlayOpacity={0.38}>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Pressable
            style={styles.closeIconButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close welcome message"
          >
            <Ionicons name="close" size={16} color="#FFFFFF" />
          </Pressable>

          <View style={[styles.logoFrame, { borderColor: theme.colors.border }]}>
            <Image source={require('../../assets/suki-send-logo.png')} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
            Welcome to SUKI SEND
          </Text>
          <Text style={[styles.message, { color: theme.colors.textMuted }]}>
            Shop daily essentials with secure COD checkout and doorstep delivery.
          </Text>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 340,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '90%',
  },
  closeIconButton: {
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 10,
    width: 26,
    zIndex: 1,
  },
  logoFrame: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    width: 148,
  },
  logo: {
    height: 58,
    width: 124,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 8,
    textAlign: 'center',
  },
});
