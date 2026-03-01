import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationLightTheme, NavigationContainer } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { FullScreenVideoLoader } from '../components/FullScreenVideoLoader';
import { StartupWelcomeModal } from '../components/StartupWelcomeModal';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../providers/ThemeProvider';
import { OnboardingScreen } from '../screens/customer/OnboardingScreen';
import { AdminNavigator } from './AdminNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { RiderNavigator } from './RiderNavigator';

const ONBOARDING_KEY = 'suki-send-has-seen-onboarding';
const WELCOME_SEEN_KEY = 'suki-send-has-seen-startup-welcome';
const FIRST_LAUNCH_KEY = 'suki-send-first-launch-complete';

export function RootNavigator() {
  const { theme } = useTheme();
  const { loading: authLoading, role } = useAuth();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ONBOARDING_KEY),
      AsyncStorage.getItem(WELCOME_SEEN_KEY),
      AsyncStorage.getItem(FIRST_LAUNCH_KEY),
    ])
      .then(([onboardingValue, welcomeSeenValue, firstLaunchValue]) => {
        setHasSeenOnboarding(onboardingValue === 'true');

        const isFirstLaunch = firstLaunchValue !== 'true';
        if (isFirstLaunch) {
          setShowWelcomeModal(false);
          void AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
          return;
        }

        setShowWelcomeModal(welcomeSeenValue !== 'true');
      })
      .finally(() => {
        setBootstrapping(false);
      });
  }, []);

  const completeOnboarding = async () => {
    setHasSeenOnboarding(true);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  };

  const dismissWelcomeModal = useCallback(() => {
    setShowWelcomeModal(false);
    void AsyncStorage.setItem(WELCOME_SEEN_KEY, 'true');
  }, []);

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

  const screenContent =
    bootstrapping || authLoading ? (
      <FullScreenVideoLoader
        visible
        label="Preparing SUKI SEND"
        message="Loading your dashboard and syncing store updates."
      />
    ) : !hasSeenOnboarding ? (
      <OnboardingScreen onContinue={completeOnboarding} />
    ) : (
      <NavigationContainer theme={navTheme}>
        {role === 'admin' ? <AdminNavigator /> : role === 'rider' ? <RiderNavigator /> : <CustomerNavigator />}
      </NavigationContainer>
    );

  return (
    <>
      {screenContent}
      <StartupWelcomeModal
        visible={!bootstrapping && !authLoading && hasSeenOnboarding && showWelcomeModal && (role === 'guest' || role === 'customer')}
        onClose={dismissWelcomeModal}
      />
    </>
  );
}

