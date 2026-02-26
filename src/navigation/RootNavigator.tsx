import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme as NavigationDarkTheme, DefaultTheme as NavigationLightTheme, NavigationContainer } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../providers/ThemeProvider';
import { OnboardingScreen } from '../screens/customer/OnboardingScreen';
import { AdminNavigator } from './AdminNavigator';
import { CustomerNavigator } from './CustomerNavigator';

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
      <View style={[styles.loaderWrap, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loaderText, { color: theme.colors.textMuted }]}>Preparing SUKI SEND...</Text>
      </View>
    );
  }

  if (!hasSeenOnboarding) {
    return <OnboardingScreen onContinue={completeOnboarding} />;
  }

  return <NavigationContainer theme={navTheme}>{role === 'admin' ? <AdminNavigator /> : <CustomerNavigator />}</NavigationContainer>;
}

const styles = StyleSheet.create({
  loaderWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  loaderText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
});
