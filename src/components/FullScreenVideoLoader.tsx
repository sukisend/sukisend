import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface FullScreenVideoLoaderProps {
  visible: boolean;
}

export function FullScreenVideoLoader({ visible }: FullScreenVideoLoaderProps) {
  const { theme } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    flex: 1,
    justifyContent: 'center',
  },
});
