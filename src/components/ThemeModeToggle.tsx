import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

interface ThemeModeToggleProps {
  compact?: boolean;
  showLabel?: boolean;
}

const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 24;
const THUMB_SIZE = 20;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - 4;

export function ThemeModeToggle({ compact = false, showLabel = true }: ThemeModeToggleProps) {
  const { theme, mode, toggleTheme } = useTheme();
  const isDark = mode === 'dark';
  const progress = useRef(new Animated.Value(isDark ? 1 : 0)).current;
  const useNativeDriver = Platform.OS !== 'web';

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isDark ? 1 : 0,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    }).start();
  }, [isDark, progress, useNativeDriver]);

  const translateX = useMemo(
    () =>
      progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, THUMB_TRAVEL],
      }),
    [progress],
  );

  return (
    <Pressable
      onPress={toggleTheme}
      style={[
        styles.wrapper,
        compact ? styles.wrapperCompact : null,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.isDark ? '#0B1220' : '#E2E8F0',
        },
      ]}
    >
      <View
        style={[
          styles.track,
          {
            backgroundColor: isDark ? '#111827' : '#CBD5E1',
            borderColor: isDark ? '#1F2937' : '#94A3B8',
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: '#FFFFFF',
              transform: [{ translateX }],
            },
          ]}
        />
      </View>
      {showLabel ? <Text style={[styles.label, { color: theme.colors.text }]}>{isDark ? 'Dark' : 'Light'}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 82,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  wrapperCompact: {
    minWidth: 76,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  track: {
    borderWidth: 1,
    borderRadius: 999,
    height: TRACK_HEIGHT,
    width: TRACK_WIDTH,
  },
  thumb: {
    borderRadius: 999,
    height: THUMB_SIZE,
    left: 2,
    position: 'absolute',
    top: 1,
    width: THUMB_SIZE,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
});
