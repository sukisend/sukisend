import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';

type AuthRoute = RouteProp<CustomerStackParamList, 'Auth'>;

type AuthMode = 'signin' | 'signup' | 'admin';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<AuthRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { signIn, signUp } = useAuth();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();

  const initialMode = route.params?.mode ?? 'signin';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';
  const isAdminMode = mode === 'admin';

  const title = isSignup ? 'Create Customer Account' : isAdminMode ? 'Admin Sign In' : 'Customer Sign In';

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert({
        title: 'Missing details',
        message: 'Email and password are required.',
        tone: 'info',
      });
      return;
    }

    if (isSignup && !name.trim()) {
      showAlert({
        title: 'Missing name',
        message: 'Please enter your full name.',
        tone: 'info',
      });
      return;
    }

    setSubmitting(true);

    try {
      if (isSignup) {
        const message = await signUp(name.trim(), email.trim(), password.trim());
        if (message) {
          showAlert({
            title: 'Sign up failed',
            message,
            tone: 'error',
          });
          return;
        }

        showAlert({
          title: 'Account created',
          message: 'Check your email for the confirmation link, then sign in.',
          tone: 'success',
        });
        setMode('signin');
        return;
      }

      const message = await signIn(email.trim(), password.trim(), isAdminMode);
      if (message) {
        showAlert({
          title: 'Sign in failed',
          message,
          tone: 'error',
        });
        return;
      }

      navigation.goBack();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        {isAdminMode
          ? 'Store manager access'
          : 'Sign in to place orders, track deliveries, and save your shopping history.'}
      </Text>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isSignup ? (
          <>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Full Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Juan Dela Cruz"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
          </>
        ) : null}

        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="name@email.com"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        <Pressable
          style={[styles.primaryButton, { backgroundColor: submitting ? theme.colors.surfaceAlt : theme.colors.primary }]}
          disabled={submitting}
          onPress={submit}
        >
          <Text style={[styles.primaryButtonText, { color: submitting ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
            {submitting ? 'Please wait...' : isSignup ? 'Create Account' : 'Sign In'}
          </Text>
        </Pressable>
      </View>

      {!isAdminMode ? (
        <View style={styles.switchWrap}>
          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
            onPress={() => setMode(isSignup ? 'signin' : 'signup')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
              {isSignup ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, marginTop: 14 }]}
          onPress={() => setMode('signin')}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Back to Customer Sign In</Text>
        </Pressable>
      )}

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 14,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 14,
    padding: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButton: {
    borderRadius: 999,
    marginTop: 10,
    paddingVertical: 13,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  switchWrap: {
    gap: 10,
    marginTop: 14,
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
