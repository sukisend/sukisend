import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';
import { BrandAlertConfig } from '../hooks/useBrandAlert';

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

  return (
    <Modal visible={config.visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={styles.iconRow}>
            <Ionicons name={toneMeta.icon as any} size={28} color={toneMeta.color} />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>{config.title}</Text>
          <Text style={[styles.message, { color: theme.colors.textMuted }]}>{config.message}</Text>

          <Pressable style={[styles.button, { backgroundColor: theme.colors.primary }]} onPress={onConfirm}>
            <Text style={[styles.buttonText, { color: theme.colors.primaryContrast }]}>{config.actionLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: '#00000066',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    width: '100%',
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 6,
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
  button: {
    borderRadius: 999,
    marginTop: 16,
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
