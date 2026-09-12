import { DefaultTheme as NavigationLightTheme, NavigationContainer } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';

import { FullScreenVideoLoader } from '../components/FullScreenVideoLoader';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../providers/ThemeProvider';
import { AdminNavigator } from './AdminNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { RiderNavigator } from './RiderNavigator';

export function RootNavigator() {
  const { theme } = useTheme();
  const { loading: authLoading, role } = useAuth();
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBootstrapping(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const navTheme = useMemo(
    () => ({
      ...NavigationLightTheme,
      colors: {
        ...NavigationLightTheme.colors,
        background: theme.colors.background,
        card: theme.colors.surface,
        border: theme.colors.border,
        text: theme.colors.text,
        primary: theme.colors.primary,
      },
    }),
    [theme],
  );

  const screenContent =
    bootstrapping || authLoading ? (
      <FullScreenVideoLoader visible />
    ) : (
      <NavigationContainer theme={navTheme}>
        {role === 'admin' ? <AdminNavigator /> : role === 'rider' ? <RiderNavigator /> : <CustomerNavigator />}
      </NavigationContainer>
    );

  return (
    <>
      {screenContent}
    </>
  );
}
