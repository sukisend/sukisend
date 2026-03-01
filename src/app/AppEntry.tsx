import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from '../navigation/RootNavigator';
import { AuthProvider } from '../providers/AuthProvider';
import { ThemeProvider } from '../providers/ThemeProvider';

const POINTER_EVENTS_DEPRECATION = 'props.pointerEvents is deprecated. Use style.pointerEvents';

if (__DEV__ && typeof window !== 'undefined') {
  const runtime = globalThis as { __sukiWarnPatchApplied?: boolean };

  if (!runtime.__sukiWarnPatchApplied) {
    const originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      const firstArg = args[0];
      if (typeof firstArg === 'string' && firstArg.includes(POINTER_EVENTS_DEPRECATION)) {
        return;
      }
      originalWarn(...args);
    };
    runtime.__sukiWarnPatchApplied = true;
  }
}

export function AppEntry() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="auto" translucent={false} />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
