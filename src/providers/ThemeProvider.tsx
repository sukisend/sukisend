import { createContext, PropsWithChildren, useCallback, useContext, useMemo } from 'react';

import { AppTheme, lightTheme } from '../theme/tokens';

type ThemeMode = 'light';

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const setMode = useCallback(() => {}, []);

  const toggleTheme = useCallback(() => {}, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: lightTheme,
      mode: 'light',
      toggleTheme,
      setMode,
    }),
    [setMode, toggleTheme],
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
