import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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

  const content = (
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
  );

  if (Platform.OS === 'web') {
    if (!config.visible) {
      return null;
    }

    return <View style={styles.backdrop}>{content}</View>;
  }

  return (
    <Modal visible={config.visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>{content}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: '#00000066',
    bottom: 0,
    flex: 1,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 18,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 999,
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
