import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandAlertConfig } from '../hooks/useBrandAlert';
import { useTheme } from '../providers/ThemeProvider';
import { ModalBackdrop } from './ModalBackdrop';

interface BrandAlertModalProps {
  config: BrandAlertConfig;
  onClose: () => void;
  onConfirm: () => void;
}

export function BrandAlertModal({ config, onClose, onConfirm }: BrandAlertModalProps) {
  const { theme } = useTheme();

  const toneMeta =
    config.tone === 'success'
      ? { icon: 'checkmark-circle', color: theme.colors.success }
      : config.tone === 'error'
        ? { icon: 'alert-circle', color: theme.colors.danger }
        : { icon: 'information-circle', color: theme.colors.primary };

  const content = (
    <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <Pressable style={styles.closeIconButton} onPress={onClose} hitSlop={8} accessibilityLabel="Close alert">
        <Ionicons name="close" size={15} color="#FFFFFF" />
      </Pressable>
      <View style={styles.iconRow}>
        <Ionicons name={toneMeta.icon as any} size={28} color={toneMeta.color} />
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{config.title}</Text>
      <Text style={[styles.message, { color: theme.colors.textMuted }]}>{config.message}</Text>

      <View style={styles.footerRow}>
        <Pressable style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={onConfirm}>
          <Text style={[styles.buttonText, { color: theme.colors.primaryContrast }]}>{config.actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={config.visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <ModalBackdrop overlayOpacity={0.42}>{content}</ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    position: 'relative',
    width: '100%',
  },
  closeIconButton: {
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderColor: '#FCA5A5',
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    top: 12,
    width: 28,
    zIndex: 2,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  footerRow: {
    marginTop: 16,
  },
  button: {
    borderRadius: 999,
    width: '100%',
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
