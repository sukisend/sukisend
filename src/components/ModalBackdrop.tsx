import { BlurView } from 'expo-blur';
import { PropsWithChildren, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface ModalBackdropProps extends PropsWithChildren {
  align?: 'center' | 'flex-start' | 'flex-end';
  intensity?: number;
  overlayOpacity?: number;
  paddingHorizontal?: number;
}

export function ModalBackdrop({
  children,
  align = 'center',
  intensity = 45,
  overlayOpacity = 0.48,
  paddingHorizontal = 16,
}: ModalBackdropProps) {
  const { theme } = useTheme();
  const useBlur = Platform.OS !== 'android';

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    activeElement?.blur?.();
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          justifyContent: align,
          alignItems: align === 'center' ? 'center' : 'stretch',
          paddingHorizontal,
        },
      ]}
    >
      {useBlur ? (
        <BlurView intensity={intensity} tint={theme.isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.isDark
              ? `rgba(2, 6, 23, ${overlayOpacity})`
              : `rgba(15, 23, 42, ${Math.max(0.22, overlayOpacity * 0.55)})`,
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
});
