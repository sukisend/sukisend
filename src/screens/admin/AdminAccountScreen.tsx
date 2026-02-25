import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';

export function AdminAccountScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, mode, toggleTheme } = useTheme();
  const { profile, signOut } = useAuth();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingBottom: tabBarHeight + 16 }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Admin Account</Text>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Profile</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Name: {profile?.fullName}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Email: {profile?.email}</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Role: {profile?.role}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Appearance</Text>
        <View style={styles.row}>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Dark Mode</Text>
          <Switch value={mode === 'dark'} onValueChange={toggleTheme} />
        </View>
      </View>

      <Pressable style={[styles.signOutButton, { backgroundColor: theme.colors.danger }]} onPress={() => signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signOutButton: {
    borderRadius: 999,
    marginTop: 16,
    paddingVertical: 13,
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
