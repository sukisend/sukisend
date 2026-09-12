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
        <Ionicons name={toneMeta.icon as any} size={22} color={toneMeta.color} />
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{config.title}</Text>
      <Text style={[styles.message, { color: theme.colors.textMuted }]}>{config.message}</Text>

      <View style={styles.footerRow}>
        {config.cancelLabel ? (
          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.buttonSecondary, { borderColor: theme.colors.border }]} onPress={onClose}>
              <Text style={[styles.buttonText, { color: theme.colors.text }]}>{config.cancelLabel}</Text>
            </Pressable>
            <Pressable style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={onConfirm}>
              <Text style={[styles.buttonText, { color: theme.colors.primaryContrast }]}>{config.actionLabel}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={onConfirm}>
            <Text style={[styles.buttonText, { color: theme.colors.primaryContrast }]}>{config.actionLabel}</Text>
          </Pressable>
        )}
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
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
    position: 'relative',
    width: '100%',
  },
  closeIconButton: {
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderColor: '#FCA5A5',
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 10,
    width: 24,
    zIndex: 2,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'center',
  },
  footerRow: {
    marginTop: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    borderRadius: 999,
    flex: 1,
    paddingVertical: 12,
  },
  buttonSecondary: {
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
