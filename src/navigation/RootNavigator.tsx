import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationLightTheme, NavigationContainer } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';

import { FullScreenVideoLoader } from '../components/FullScreenVideoLoader';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../providers/ThemeProvider';
import { OnboardingScreen } from '../screens/customer/OnboardingScreen';
import { AdminNavigator } from './AdminNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { RiderNavigator } from './RiderNavigator';

const ONBOARDING_KEY = 'suki-send-has-seen-onboarding';

export function RootNavigator() {
  const { theme } = useTheme();
  const { loading: authLoading, role } = useAuth();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => {
        setHasSeenOnboarding(value === 'true');
      })
      .finally(() => {
        setBootstrapping(false);
      });
  }, []);

  const completeOnboarding = async () => {
    setHasSeenOnboarding(true);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  };

  const navTheme = useMemo(
    () =>
      theme.isDark
        ? {
            ...NavigationDarkTheme,
            colors: {
              ...NavigationDarkTheme.colors,
              background: theme.colors.background,
              card: theme.colors.surface,
              border: theme.colors.border,
              text: theme.colors.text,
              primary: theme.colors.primary,
            },
          }
        : {
            ...NavigationLightTheme,
            colors: {
              ...NavigationLightTheme.colors,
              background: theme.colors.background,
              card: theme.colors.surface,
              border: theme.colors.border,
              text: theme.colors.text,
              primary: theme.colors.primary,
            },
          },
    [theme],
  );

  if (bootstrapping || authLoading) {
    return (
      <FullScreenVideoLoader
        visible
        label="Preparing SUKI SEND"
        message="Loading your dashboard and syncing store updates."
      />
    );
  }

  if (!hasSeenOnboarding) {
    return <OnboardingScreen onContinue={completeOnboarding} />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      {role === 'admin' ? <AdminNavigator /> : role === 'rider' ? <RiderNavigator /> : <CustomerNavigator />}
    </NavigationContainer>
  );
}

