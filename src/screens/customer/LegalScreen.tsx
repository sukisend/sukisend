import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../providers/ThemeProvider';

const TERMS = [
  'Use real and complete delivery information. Fake addresses or fake identities may lead to account restriction.',
  'Cash on delivery orders must be paid upon successful delivery.',
  'Customers can request cancellation only before store approval, based on order status rules.',
  'Respectful communication is required in chat and reviews.',
];

const PRIVACY = [
  'SUKI SEND stores only required account, order, and delivery data for operations and support.',
  'Location details are used only for delivery routing, tracking, and shipping fee calculation.',
  'Uploaded photos for reviews/refunds are used only for quality, dispute handling, and order support.',
];

const SAFETY = [
  'Authentication and database access are protected by Supabase auth and row-level security policies.',
  'Admin actions (restrictions and account moderation) are logged for accountability.',
  'Suspicious abuse or repeated payment/address violations can trigger account restrictions.',
];

export function LegalScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20, paddingHorizontal: 14 }}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>Security, Privacy, and Terms</Text>
      <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
        SUKI SEND protects your account and delivery information while keeping ordering fast and reliable.
      </Text>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Terms & Conditions</Text>
        {TERMS.map((line) => (
          <Text key={line} style={[styles.line, { color: theme.colors.textMuted }]}>
            • {line}
          </Text>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Privacy Notice</Text>
        {PRIVACY.map((line) => (
          <Text key={line} style={[styles.line, { color: theme.colors.textMuted }]}>
            • {line}
          </Text>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Security Commitments</Text>
        {SAFETY.map((line) => (
          <Text key={line} style={[styles.line, { color: theme.colors.textMuted }]}>
            • {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 6,
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
  line: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
});
