import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLogoCard } from '../../components/BrandLogoCard';
import { ThemeModeToggle } from '../../components/ThemeModeToggle';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';

export function RiderAccountScreen() {
  const { theme } = useTheme();
  const { profile, signOut } = useAuth();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>Rider Account</Text>
      <BrandLogoCard title="SUKI SEND Rider" subtitle="Delivery updates and account tools." style={styles.brandCard} />

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
          <ThemeModeToggle compact />
        </View>
      </View>

      <View style={[styles.card, styles.signOutCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <BrandLogoCard compact title="Secure Session" subtitle="Sign out when your shift ends." />
        <Pressable style={[styles.signOutButton, { backgroundColor: theme.colors.danger }]} onPress={() => signOut()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>
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
  brandCard: {
    marginTop: 12,
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
    paddingVertical: 13,
  },
  signOutCard: {
    marginTop: 16,
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
