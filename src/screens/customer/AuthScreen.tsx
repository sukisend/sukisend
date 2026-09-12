import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useId, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { FullScreenVideoLoader } from '../../components/FullScreenVideoLoader';
import { AppTextInput } from '../../components/AppTextInput';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { useAddressLocations } from '../../hooks/useAddressLocations';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { supabase } from '../../lib/supabase';
import { wait } from '../../utils/async';
import { blurActiveWebElement, buildWebInputId } from '../../utils/webAccessibility';

const SECRET_QUESTIONS = [
  "What is your mother's maiden name?",
  'What was the name of your first pet?',
  'What city were you born in?',
  'What is the name of your favorite teacher?',
  'What was your childhood nickname?',
  'What is the name of your best friend?',
  'What was the make of your first car?',
  'What is your favorite food?',
];

const SECRET_DROPDOWN_MAX_HEIGHT = 180;

type AuthRoute = RouteProp<CustomerStackParamList, 'Auth'>;

type AuthMode = 'signin' | 'signup' | 'admin' | 'forgot';

type ForgotStep = 'username' | 'birthdate' | 'secret' | 'newpassword';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<AuthRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { signIn, signUp } = useAuth();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const answerRef = useRef<TextInput>(null);

  const initialMode = route.params?.mode ?? 'signin';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [contactNumber, setContactNumber] = useState('+63');
  const [birthdate, setBirthdate] = useState('');
  const [sitio, setSitio] = useState('');
  const [barangay, setBarangay] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [province, setProvince] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [secretQuestion, setSecretQuestion] = useState('');
  const [secretAnswer, setSecretAnswer] = useState('');
  const [showSecretDropdown, setShowSecretDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState(new Date().getMonth());
  const [datePickerDay, setDatePickerDay] = useState(new Date().getDate());
  const [datePickerYear, setDatePickerYear] = useState(new Date().getFullYear() - 18);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const authFieldScope = useId();
  const { provinceOptions, cityOptions, barangayOptions, loadingLocations } = useAddressLocations(province, municipality);

  // Forgot password state
  const [forgotStep, setForgotStep] = useState<ForgotStep>('username');
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotProfileId, setForgotProfileId] = useState('');
  const [forgotSecretQuestion, setForgotSecretQuestion] = useState('');
  const [forgotBirthdate, setForgotBirthdate] = useState('');
  const [forgotSecretAnswer, setForgotSecretAnswer] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotBdPicker, setShowForgotBdPicker] = useState(false);
  const [forgotBdMonth, setForgotBdMonth] = useState(0);
  const [forgotBdDay, setForgotBdDay] = useState(1);
  const [forgotBdYear, setForgotBdYear] = useState(new Date().getFullYear() - 18);
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const isSignup = mode === 'signup';
  const isAdminMode = mode === 'admin';
  const isForgotMode = mode === 'forgot';
  const getAuthInputId = (field: string) => buildWebInputId('auth', authFieldScope, field);

  const title = isSignup ? 'Create Account' : isAdminMode ? 'Staff Sign In' : isForgotMode ? 'Recover Account' : 'Welcome Back';

  const handleForgotUsernameSubmit = async () => {
    if (!forgotUsername.trim()) {
      showAlert({ title: 'Missing username', message: 'Please enter your username.', tone: 'info' });
      return;
    }
    setForgotLoading(true);
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('verify_username_for_recovery', { p_username: forgotUsername.trim() });
      if (error) throw error;
      if (!data || data.length === 0) {
        showAlert({ title: 'Not found', message: 'No account found with that username.', tone: 'error' });
        return;
      }
      setForgotProfileId(data[0].profile_id);
      setForgotSecretQuestion(data[0].secret_question);
      setForgotStep('birthdate');
    } catch (err) {
      showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotBirthdateSubmit = () => {
    const mm = String(forgotBdMonth + 1).padStart(2, '0');
    const dd = String(forgotBdDay).padStart(2, '0');
    setForgotBirthdate(`${forgotBdYear}-${mm}-${dd}`);
    setForgotStep('secret');
  };

  const handleForgotSecretSubmit = async () => {
    if (!forgotSecretAnswer.trim()) {
      showAlert({ title: 'Missing answer', message: 'Please enter your secret answer.', tone: 'info' });
      return;
    }
    setForgotLoading(true);
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('verify_secret_answer', {
        p_profile_id: forgotProfileId,
        p_answer: forgotSecretAnswer.trim(),
      });
      if (error) throw error;
      if (!data) {
        showAlert({ title: 'Wrong answer', message: 'The secret answer you entered is incorrect.', tone: 'error' });
        return;
      }
      setForgotStep('newpassword');
    } catch (err) {
      showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotPasswordReset = async () => {
    if (!/^\d{8}$/.test(forgotNewPassword)) {
      showAlert({ title: 'Invalid password', message: 'Password must be exactly 8 numerical digits.', tone: 'info' });
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      showAlert({ title: 'Passwords do not match', message: 'Please re-type your new password.', tone: 'info' });
      return;
    }
    setForgotLoading(true);
    try {
      if (!supabase) throw new Error('Supabase not configured');
      const { data, error } = await supabase.rpc('reset_password_by_secret', {
        p_profile_id: forgotProfileId,
        p_birthdate: forgotBirthdate,
        p_secret_answer: forgotSecretAnswer.trim(),
        p_new_password: forgotNewPassword,
      });
      if (error) throw error;
      if (data) {
        showAlert({ title: 'Reset failed', message: data, tone: 'error' });
        return;
      }
      showAlert({
        title: 'Password reset',
        message: 'Your password has been updated. You can now sign in.',
        tone: 'success',
        actionLabel: 'Sign In',
        onAction: () => {
          setMode('signin');
          setForgotUsername('');
          setForgotProfileId('');
          setForgotSecretQuestion('');
          setForgotBirthdate('');
          setForgotSecretAnswer('');
          setForgotNewPassword('');
          setForgotConfirmPassword('');
          setForgotStep('username');
          setEmail(forgotUsername);
        },
      });
    } catch (err) {
      showAlert({ title: 'Error', message: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally {
      setForgotLoading(false);
    }
  };

  const submit = async () => {
    if (isAdminMode) {
      if (!email.trim() || !password.trim()) {
        showAlert({ title: 'Missing details', message: 'Username and password are required.', tone: 'info' });
        return;
      }
    } else if (isSignup) {
      if (!fullName.trim()) {
        showAlert({ title: 'Missing name', message: 'Please enter your full name.', tone: 'info' });
        return;
      }
      if (!username.trim()) {
        showAlert({ title: 'Missing username', message: 'Please enter a username.', tone: 'info' });
        return;
      }
      if (!barangay.trim()) {
        showAlert({ title: 'Missing barangay', message: 'Please enter your barangay.', tone: 'info' });
        return;
      }
      if (!municipality.trim()) {
        showAlert({ title: 'Missing municipality', message: 'Please enter your municipality.', tone: 'info' });
        return;
      }
      if (!province.trim()) {
        showAlert({ title: 'Missing province', message: 'Please enter your province.', tone: 'info' });
        return;
      }
      if (!/^\d{8}$/.test(password)) {
        showAlert({ title: 'Invalid password', message: 'Password must be exactly 8 numerical digits.', tone: 'info' });
        return;
      }
      if (password !== confirmPassword) {
        showAlert({ title: 'Passwords do not match', message: 'Please re-type your password to confirm.', tone: 'info' });
        return;
      }
      if (!secretQuestion.trim()) {
        showAlert({ title: 'Missing secret question', message: 'Please select a secret question.', tone: 'info' });
        return;
      }
      if (!secretAnswer.trim()) {
        showAlert({ title: 'Missing answer', message: 'Please type your answer to the secret question.', tone: 'info' });
        return;
      }
    } else {
      if (!email.trim() || !password.trim()) {
        showAlert({ title: 'Missing details', message: 'Username and password are required.', tone: 'info' });
        return;
      }
    }

    blurActiveWebElement();
    setSubmitting(true);

    try {
      if (isSignup) {
        const [message] = await Promise.all([
          signUp(fullName.trim(), username.trim(), password, {
            sitio: sitio.trim(),
            barangay: barangay.trim(),
            municipality: municipality.trim(),
            province: province.trim(),
            secret_question: secretQuestion.trim(),
            secret_answer: secretAnswer.trim(),
            contact_number: contactNumber.trim(),
            birthdate: birthdate.trim(),
          }),
          wait(6000),
        ]);
        if (message) {
          showAlert({ title: 'Sign up failed', message, tone: 'error' });
          return;
        }

        showAlert({
          title: 'Account created',
          message: 'Account created! You can now sign in.',
          tone: 'success',
        });
        setMode('signin');
        return;
      }

      const [message] = await Promise.all([
        signIn(email.trim(), password.trim(), isAdminMode),
        wait(6000),
      ]);
      if (message) {
        showAlert({ title: 'Sign in failed', message, tone: 'error' });
        return;
      }

      showAlert({
        title: isAdminMode ? 'Welcome back, Staff' : 'Welcome to SUKI SEND',
        message: isAdminMode
          ? 'Staff access is ready. You can now open your assigned dashboard.'
          : 'Login successful. Enjoy safer and easier shopping with SUKI SEND.',
        tone: 'success',
        actionLabel: 'Continue',
        onAction: () => navigation.goBack(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const sectionHeader = (icon: keyof typeof Ionicons.glyphMap, label: string) => (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={14} color={theme.colors.primary} />
      <Text style={[styles.sectionHeaderText, { color: theme.colors.text }]}>{label}</Text>
    </View>
  );

  const fieldLabel = (label: string, required = false) => (
    <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>
      {label}{required ? ' *' : ''}
    </Text>
  );

  const inputStyle = [styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {isAdminMode && (
          <View style={[styles.adminBadge, { backgroundColor: theme.colors.primary + '18' }]}>
            <Ionicons name="shield-checkmark" size={12} color={theme.colors.primary} />
            <Text style={[styles.adminBadgeText, { color: theme.colors.primary }]}>Staff</Text>
          </View>
        )}
      </View>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        {isAdminMode
          ? 'Staff access portal'
          : isSignup
            ? 'Fill in your details to get started.'
            : 'Sign in to continue shopping.'}
      </Text>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        {isForgotMode ? (
          <>
            {forgotStep === 'username' && (
              <>
                {sectionHeader('person-outline', 'Step 1: Enter Username')}
                {fieldLabel('Username', true)}
                <AppTextInput
                  value={forgotUsername}
                  onChangeText={setForgotUsername}
                  placeholder="Enter your username"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="none"
                  style={inputStyle}
                />
                <Pressable
                  style={[styles.primaryButton, { backgroundColor: forgotLoading ? theme.colors.surfaceAlt : theme.colors.primary }]}
                  disabled={forgotLoading}
                  onPress={handleForgotUsernameSubmit}
                >
                  {forgotLoading ? (
                    <Text style={[styles.primaryButtonText, { color: theme.colors.textMuted }]}>Verifying...</Text>
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Next</Text>
                  )}
                </Pressable>
              </>
            )}

            {forgotStep === 'birthdate' && (
              <>
                {sectionHeader('calendar-outline', 'Step 2: Enter Birthdate')}
                <Pressable
                  style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => setShowForgotBdPicker(true)}
                >
                  <Text style={{ color: forgotBirthdate ? theme.colors.text : theme.colors.textMuted, fontSize: 14 }}>
                    {forgotBirthdate || 'Select your birthdate'}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                  onPress={handleForgotBirthdateSubmit}
                >
                  <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Next</Text>
                </Pressable>
              </>
            )}

            {forgotStep === 'secret' && (
              <>
                {sectionHeader('help-circle-outline', 'Step 3: Answer Secret Question')}
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted, fontStyle: 'italic' }]}>
                  {forgotSecretQuestion}
                </Text>
                {fieldLabel('Your Answer', true)}
                <AppTextInput
                  value={forgotSecretAnswer}
                  onChangeText={setForgotSecretAnswer}
                  placeholder="Type your answer here"
                  placeholderTextColor={theme.colors.textMuted}
                  style={inputStyle}
                />
                <Pressable
                  style={[styles.primaryButton, { backgroundColor: forgotLoading ? theme.colors.surfaceAlt : theme.colors.primary }]}
                  disabled={forgotLoading}
                  onPress={handleForgotSecretSubmit}
                >
                  {forgotLoading ? (
                    <Text style={[styles.primaryButtonText, { color: theme.colors.textMuted }]}>Verifying...</Text>
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Next</Text>
                  )}
                </Pressable>
              </>
            )}

            {forgotStep === 'newpassword' && (
              <>
                {sectionHeader('lock-closed-outline', 'Step 4: Set New Password')}
                {fieldLabel('New Password (8 digits)', true)}
                <View style={styles.passwordWrap}>
                  <AppTextInput
                    value={forgotNewPassword}
                    onChangeText={setForgotNewPassword}
                    placeholder="8 digits only (e.g. 12345678)"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={8}
                    secureTextEntry={!showForgotNewPassword}
                    style={inputStyle}
                  />
                  <Pressable style={styles.eyeToggle} onPress={() => setShowForgotNewPassword(!showForgotNewPassword)}>
                    <Ionicons name={showForgotNewPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>

                {fieldLabel('Confirm New Password', true)}
                <View style={styles.passwordWrap}>
                  <AppTextInput
                    value={forgotConfirmPassword}
                    onChangeText={setForgotConfirmPassword}
                    placeholder="Re-enter your new password"
                    placeholderTextColor={theme.colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={8}
                    secureTextEntry={!showForgotConfirmPassword}
                    style={inputStyle}
                  />
                  <Pressable style={styles.eyeToggle} onPress={() => setShowForgotConfirmPassword(!showForgotConfirmPassword)}>
                    <Ionicons name={showForgotConfirmPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
                {forgotNewPassword.length > 0 && forgotConfirmPassword.length > 0 && forgotNewPassword !== forgotConfirmPassword && (
                  <Text style={[styles.fieldError, { color: '#E53935' }]}>Passwords do not match</Text>
                )}

                <Pressable
                  style={[styles.primaryButton, { backgroundColor: forgotLoading ? theme.colors.surfaceAlt : theme.colors.primary }]}
                  disabled={forgotLoading}
                  onPress={handleForgotPasswordReset}
                >
                  {forgotLoading ? (
                    <Text style={[styles.primaryButtonText, { color: theme.colors.textMuted }]}>Resetting...</Text>
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Reset Password</Text>
                  )}
                </Pressable>
              </>
            )}

            {/* Forgot Password Birthdate Picker Modal */}
            <Modal visible={showForgotBdPicker} transparent animationType="fade" onRequestClose={() => setShowForgotBdPicker(false)}>
              <Pressable style={styles.dateModalOverlay} onPress={() => setShowForgotBdPicker(false)}>
                <Pressable style={[styles.dateModalContent, { backgroundColor: theme.colors.card }]} onPress={(e) => e.stopPropagation()}>
                  <View style={styles.dateModalHeader}>
                    <Text style={[styles.dateModalTitle, { color: theme.colors.text }]}>Select Birthdate</Text>
                    <Pressable onPress={() => setShowForgotBdPicker(false)}>
                      <Ionicons name="close" size={22} color={theme.colors.textMuted} />
                    </Pressable>
                  </View>
                  <View style={styles.datePickerRow}>
                    <View style={styles.datePickerCol}>
                      <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Month</Text>
                      <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                        {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                          <Pressable
                            key={m}
                            style={[styles.datePickerItem, forgotBdMonth === i && { backgroundColor: theme.colors.primary + '15' }]}
                            onPress={() => setForgotBdMonth(i)}
                          >
                            <Text style={[styles.datePickerItemText, { color: forgotBdMonth === i ? theme.colors.primary : theme.colors.text }]}>{m.slice(0, 3)}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={styles.datePickerCol}>
                      <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Day</Text>
                      <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <Pressable
                            key={d}
                            style={[styles.datePickerItem, forgotBdDay === d && { backgroundColor: theme.colors.primary + '15' }]}
                            onPress={() => setForgotBdDay(d)}
                          >
                            <Text style={[styles.datePickerItemText, { color: forgotBdDay === d ? theme.colors.primary : theme.colors.text }]}>{d}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={styles.datePickerCol}>
                      <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Year</Text>
                      <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                        {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                          <Pressable
                            key={y}
                            style={[styles.datePickerItem, forgotBdYear === y && { backgroundColor: theme.colors.primary + '15' }]}
                            onPress={() => setForgotBdYear(y)}
                          >
                            <Text style={[styles.datePickerItemText, { color: forgotBdYear === y ? theme.colors.primary : theme.colors.text }]}>{y}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                  <Pressable
                    style={[styles.dateConfirmBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={() => {
                      const mm = String(forgotBdMonth + 1).padStart(2, '0');
                      const dd = String(forgotBdDay).padStart(2, '0');
                      setForgotBirthdate(`${forgotBdYear}-${mm}-${dd}`);
                      setShowForgotBdPicker(false);
                    }}
                  >
                    <Text style={[styles.dateConfirmBtnText, { color: theme.colors.primaryContrast }]}>Confirm</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          </>
        ) : isSignup ? (
          <>
            {sectionHeader('person-outline', 'Personal Info')}

            {fieldLabel('Full Name', true)}
            <AppTextInput
              nativeID={getAuthInputId('full-name')}
              webName="auth-full-name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="e.g. Juan Dela Cruz"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Full Name"
              autoComplete="name"
              style={inputStyle}
            />

            {fieldLabel('Username', true)}
            <AppTextInput
              nativeID={getAuthInputId('username')}
              webName="auth-username"
              value={username}
              onChangeText={setUsername}
              placeholder="e.g. juan123"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              accessibilityLabel="Username"
              autoComplete="username"
              style={inputStyle}
            />

            <View style={styles.row}>
              <View style={styles.halfField}>
                {fieldLabel('Contact #')}
                <AppTextInput
                  nativeID={getAuthInputId('contact')}
                  webName="auth-contact"
                  value={contactNumber}
                  onChangeText={(v) => setContactNumber(v.startsWith('+63') ? v : `+63${v.replace(/^[+]?63/, '')}`)}
                  placeholder="9123456789"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="phone-pad"
                  accessibilityLabel="Contact Number"
                  style={inputStyle}
                />
              </View>
              <View style={styles.halfField}>
                {fieldLabel('Birthdate')}
                <Pressable
                  style={[inputStyle, styles.dateTrigger]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={[styles.dateText, { color: birthdate ? theme.colors.text : theme.colors.textMuted }]}>
                    {birthdate || 'Select date'}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            </View>

            {sectionHeader('location-outline', 'Address')}

            {fieldLabel('Sitio / Street')}
            <AppTextInput
              nativeID={getAuthInputId('sitio')}
              webName="auth-sitio"
              value={sitio}
              onChangeText={setSitio}
              placeholder="e.g. Sitio Maligaya, Blk 3 Lot 12"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Sitio"
              style={inputStyle}
            />

            <SearchableDropdown
              label="Province *"
              placeholder={loadingLocations ? 'Loading...' : 'Select province'}
              value={province}
              options={provinceOptions}
              onSelect={(val) => {
                setProvince(val);
                setMunicipality('');
                setBarangay('');
              }}
            />

            <SearchableDropdown
              label="Municipality / City *"
              placeholder={!province ? 'Select province first' : loadingLocations ? 'Loading...' : 'Select municipality'}
              value={municipality}
              options={cityOptions}
              onSelect={(val) => {
                setMunicipality(val);
                setBarangay('');
              }}
            />

            <SearchableDropdown
              label="Barangay *"
              placeholder={!municipality ? 'Select municipality first' : loadingLocations ? 'Loading...' : 'Select barangay'}
              value={barangay}
              options={barangayOptions}
              onSelect={setBarangay}
            />

            {sectionHeader('lock-closed-outline', 'Security')}

            {fieldLabel('Password', true)}
            <View style={styles.passwordWrap}>
              <AppTextInput
                nativeID={getAuthInputId('password')}
                webName="auth-password"
                value={password}
                onChangeText={setPassword}
                placeholder="8 digits only (e.g. 12345678)"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                maxLength={8}
                secureTextEntry={!showPassword}
                accessibilityLabel="Password"
                autoComplete="new-password"
                style={inputStyle}
              />
              <Pressable style={styles.eyeToggle} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {fieldLabel('Confirm Password', true)}
            <View style={styles.passwordWrap}>
              <AppTextInput
                nativeID={getAuthInputId('confirm-password')}
                webName="auth-confirm-password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your 8-digit password"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                maxLength={8}
                secureTextEntry={!showConfirmPassword}
                accessibilityLabel="Confirm Password"
                autoComplete="new-password"
                style={inputStyle}
              />
              <Pressable style={styles.eyeToggle} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            {password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword && (
              <Text style={[styles.fieldError, { color: '#E53935' }]}>Passwords do not match</Text>
            )}

            {fieldLabel('Secret Question', true)}
            <View style={styles.dropdownContainer}>
              <Pressable
                style={[styles.dropdownTrigger, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                onPress={() => setShowSecretDropdown(!showSecretDropdown)}
              >
                <Text style={[styles.dropdownTriggerText, { color: secretQuestion ? theme.colors.text : theme.colors.textMuted }]} numberOfLines={1}>
                  {secretQuestion || 'Select a secret question'}
                </Text>
                <Ionicons name={showSecretDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textMuted} />
              </Pressable>

              {showSecretDropdown && (
                <View style={[styles.dropdownList, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                  <ScrollView style={{ maxHeight: SECRET_DROPDOWN_MAX_HEIGHT }} nestedScrollEnabled showsVerticalScrollIndicator>
                    {SECRET_QUESTIONS.map((question) => {
                      const selected = secretQuestion === question;
                      return (
                        <Pressable
                          key={question}
                          style={[styles.dropdownItem, { backgroundColor: selected ? theme.colors.primary + '12' : 'transparent' }]}
                          onPress={() => {
                            setSecretQuestion(selected ? '' : question);
                            setShowSecretDropdown(false);
                            if (!selected) {
                              setTimeout(() => answerRef.current?.focus?.(), 100);
                            }
                          }}
                        >
                          <Ionicons
                            name={selected ? 'radio-button-on' : 'radio-button-off'}
                            size={14}
                            color={selected ? theme.colors.primary : theme.colors.textMuted}
                          />
                          <Text style={[styles.dropdownItemText, { color: selected ? theme.colors.primary : theme.colors.text }]} numberOfLines={2}>
                            {question}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            {fieldLabel('Your Answer', true)}
            <AppTextInput
              ref={answerRef}
              nativeID={getAuthInputId('secret-answer')}
              webName="auth-secret-answer"
              value={secretAnswer}
              onChangeText={setSecretAnswer}
              placeholder="Type your answer here"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="Secret Answer"
              style={inputStyle}
            />

            {/* Date Picker Modal */}
            <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
              <Pressable style={styles.dateModalOverlay} onPress={() => setShowDatePicker(false)}>
                <Pressable style={[styles.dateModalContent, { backgroundColor: theme.colors.card }]} onPress={(e) => e.stopPropagation()}>
                  <View style={styles.dateModalHeader}>
                    <Text style={[styles.dateModalTitle, { color: theme.colors.text }]}>Select Birthdate</Text>
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Ionicons name="close" size={22} color={theme.colors.textMuted} />
                    </Pressable>
                  </View>

                  <View style={styles.datePickerRow}>
                    {/* Month */}
                    <View style={styles.datePickerCol}>
                      <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Month</Text>
                      <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                        {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                          <Pressable
                            key={m}
                            style={[styles.datePickerItem, datePickerMonth === i && { backgroundColor: theme.colors.primary + '15' }]}
                            onPress={() => setDatePickerMonth(i)}
                          >
                            <Text style={[styles.datePickerItemText, { color: datePickerMonth === i ? theme.colors.primary : theme.colors.text }]}>{m.slice(0, 3)}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>

                    {/* Day */}
                    <View style={styles.datePickerCol}>
                      <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Day</Text>
                      <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <Pressable
                            key={d}
                            style={[styles.datePickerItem, datePickerDay === d && { backgroundColor: theme.colors.primary + '15' }]}
                            onPress={() => setDatePickerDay(d)}
                          >
                            <Text style={[styles.datePickerItemText, { color: datePickerDay === d ? theme.colors.primary : theme.colors.text }]}>{d}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>

                    {/* Year */}
                    <View style={styles.datePickerCol}>
                      <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Year</Text>
                      <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                        {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                          <Pressable
                            key={y}
                            style={[styles.datePickerItem, datePickerYear === y && { backgroundColor: theme.colors.primary + '15' }]}
                            onPress={() => setDatePickerYear(y)}
                          >
                            <Text style={[styles.datePickerItemText, { color: datePickerYear === y ? theme.colors.primary : theme.colors.text }]}>{y}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>

                  <Pressable
                    style={[styles.dateConfirmBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={() => {
                      const mm = String(datePickerMonth + 1).padStart(2, '0');
                      const dd = String(datePickerDay).padStart(2, '0');
                      setBirthdate(`${datePickerYear}-${mm}-${dd}`);
                      setShowDatePicker(false);
                    }}
                  >
                    <Text style={[styles.dateConfirmBtnText, { color: theme.colors.primaryContrast }]}>Confirm</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          </>
        ) : null}

        {!isSignup && !isForgotMode ? (
          <>
            {sectionHeader('person-outline', 'Account')}

            {fieldLabel('Username or Email', true)}
            <AppTextInput
              nativeID={getAuthInputId('email')}
              webName="auth-email"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your username or email"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              accessibilityLabel="Username or Email"
              autoComplete="username"
              style={inputStyle}
            />

            {fieldLabel('Password', true)}
            <View style={styles.passwordWrap}>
              <AppTextInput
                nativeID={getAuthInputId('password-signin')}
                webName="auth-password-signin"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry={!showPassword}
                accessibilityLabel="Password"
                autoComplete="current-password"
                style={inputStyle}
              />
              <Pressable style={styles.eyeToggle} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <Pressable onPress={() => { setMode('forgot'); setForgotStep('username'); setForgotUsername(''); }} style={{ alignSelf: 'flex-end', marginTop: 2 }}>
              <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '600' }}>Forgot Password?</Text>
            </Pressable>
          </>
        ) : null}

        {!isForgotMode && (
        <Pressable
          style={[styles.primaryButton, { backgroundColor: submitting ? theme.colors.surfaceAlt : theme.colors.primary }]}
          disabled={submitting}
          onPress={submit}
        >
          {submitting ? (
            <Text style={[styles.primaryButtonText, { color: theme.colors.textMuted }]}>Please wait...</Text>
          ) : (
            <>
              <Ionicons name={isSignup ? 'person-add' : 'log-in'} size={16} color={theme.colors.primaryContrast} />
              <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>
                {isSignup ? 'Create Account' : 'Sign In'}
              </Text>
            </>
          )}
        </Pressable>
        )}
      </View>

      {!isAdminMode ? (
        <View style={styles.switchWrap}>
          {isForgotMode ? (
            <Pressable
              style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
              onPress={() => {
                setMode('signin');
                setForgotStep('username');
                setForgotUsername('');
                setForgotProfileId('');
                setForgotSecretQuestion('');
                setForgotBirthdate('');
                setForgotSecretAnswer('');
                setForgotNewPassword('');
                setForgotConfirmPassword('');
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Back to Sign In</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
              onPress={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setShowPassword(false);
                setShowConfirmPassword(false);
                setShowSecretDropdown(false);
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                {isSignup ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, marginTop: 14 }]}
          onPress={() => { setMode('signin'); setShowPassword(false); }}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Back to Customer Sign In</Text>
        </Pressable>
      )}

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
      <FullScreenVideoLoader visible={submitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  adminBadge: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginTop: 16,
    padding: 16,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 2,
    marginTop: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 2,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  halfField: {
    flex: 1,
  },
  passwordWrap: {
    position: 'relative',
  },
  eyeToggle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 44,
  },
  fieldError: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: -4,
  },
  dropdownContainer: {
    zIndex: 10,
  },
  dropdownTrigger: {
    alignItems: 'center',
    borderColor: '#E0E0E0',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dropdownTriggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  dropdownList: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderTopWidth: 0,
    marginTop: -1,
    overflow: 'hidden',
  },
  dropdownItem: {
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 13,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  switchWrap: {
    gap: 10,
    marginTop: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  dateTrigger: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
  },
  dateModalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  dateModalContent: {
    borderRadius: 16,
    padding: 16,
    width: '100%',
  },
  dateModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dateModalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  datePickerRow: {
    flexDirection: 'row',
    gap: 8,
    height: 200,
  },
  datePickerCol: {
    flex: 1,
  },
  datePickerLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  datePickerScroll: {
    maxHeight: 180,
  },
  datePickerItem: {
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 8,
  },
  datePickerItemText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateConfirmBtn: {
    alignItems: 'center',
    borderRadius: 12,
    marginTop: 12,
    paddingVertical: 12,
  },
  dateConfirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
