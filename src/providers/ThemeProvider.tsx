import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { AppTheme, darkTheme, lightTheme } from '../theme/tokens';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'suki-send-theme-mode';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(systemColorScheme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((savedMode) => {
        if (savedMode === 'light' || savedMode === 'dark') {
          setModeState(savedMode);
        }
      })
      .catch(() => {
        // Ignore hydration failure and keep system default.
      });
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    AsyncStorage.setItem(STORAGE_KEY, nextMode).catch(() => {
      // Persist failures should not block the UI.
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setModeState((prevMode) => {
      const nextMode = prevMode === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, nextMode).catch(() => {
        // Persist failures should not block the UI.
      });
      return nextMode;
    });
  }, []);

  const theme = mode === 'dark' ? darkTheme : lightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      mode,
      toggleTheme,
      setMode,
    }),
    [theme, mode, setMode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider.');
  }

  return context;
}
