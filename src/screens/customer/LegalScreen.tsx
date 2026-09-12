import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../providers/ThemeProvider';

export function LegalScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20, paddingHorizontal: 14 }}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>Policies & Legal</Text>
      <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
        Please review our policies. By using SukiSend, you agree to the following terms.
      </Text>

      {/* ─── Terms & Conditions ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Terms & Conditions</Text>

        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          By using SukiSend, you agree to the following:
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>1. Orders</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Please review your order details before confirming. Once confirmed, orders may not be cancelled or changed if already being prepared or delivered.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>2. Payments</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Customers must pay the total amount shown in the app. For manual payments, proof of payment may be required.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>3. Delivery</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Delivery time may vary due to weather, traffic, merchant preparation, or other circumstances beyond SukiSend's control.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>4. Customer Information</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Customers must provide accurate name, contact number, and delivery address. Incorrect information may cause delays or additional delivery charges.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>5. Refunds & Issues</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Report missing, incorrect, or damaged items to SukiSend as soon as possible. Refunds or replacements are subject to verification and merchant policies.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>6. Prohibited Use</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          SukiSend must not be used for illegal activities or prohibited goods.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>7. Changes</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          SukiSend may update these Terms and Conditions when necessary. Continued use of the app means you accept the updated terms.
        </Text>

        <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
          By placing an order, you confirm that you have read and agreed to these Terms and Conditions.
        </Text>
      </View>

      {/* ─── Return & Refund Policy ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Return & Refund Policy</Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>1. Order Issues</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Customers may request a refund or replacement for incorrect, missing, damaged, or defective items.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>2. Report Immediately</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Issues should be reported to SukiSend customer support as soon as possible after receiving the order. Photos or other proof may be requested.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>3. Eligibility</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Refunds or replacements are subject to verification and may depend on the merchant's applicable return and refund policy.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>4. Non-Refundable Orders</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Orders may not be eligible for a refund if the issue is caused by incorrect customer information, change of mind, or failure to receive the order without a valid reason.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>5. Refund Processing</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Approved refunds will be processed using the available refund method. Processing time may vary depending on the payment provider.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>6. Delivery Fees</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Delivery fees may be non-refundable unless the problem was caused by SukiSend or the merchant.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>7. Policy Changes</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          SukiSend may update this policy when necessary. Changes will be communicated through the app or official channels.
        </Text>

        <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
          By placing an order, you agree to this Return & Refund Policy.
        </Text>
      </View>

      {/* ─── Privacy Policy ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Privacy Policy</Text>

        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          SukiSend respects your privacy and is committed to protecting your personal information.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>1. Information We Collect</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          We may collect information such as your name, mobile number, delivery address, order details, and payment information needed to process your orders and deliveries.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>2. How We Use Your Information</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Your information may be used to: process and deliver your orders, contact you regarding your orders, process and verify payments, provide customer support, and improve SukiSend services and security.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>3. Sharing of Information</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          We may share necessary information with merchants, delivery personnel, and payment providers only when needed to complete your order or provide our services. We do not sell your personal information.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>4. Data Security</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          We take reasonable measures to protect your personal information from unauthorized access, disclosure, or misuse.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>5. Your Rights</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          You may request access, correction, or deletion of your personal information, subject to applicable laws and legitimate business requirements.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>6. Policy Updates</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          SukiSend may update this Privacy Policy when necessary. Any changes will be communicated through the app or other appropriate channels.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>7. Contact Us</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          For privacy concerns or requests, please contact SukiSend through our official customer support channels.
        </Text>

        <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
          By using SukiSend, you acknowledge that you have read and understood this Privacy Policy.
        </Text>
      </View>

      {/* ─── Shipping & Delivery Policy ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Shipping & Delivery Policy</Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>1. Delivery Areas</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          SukiSend delivers only to areas currently covered and available in the app.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>2. Delivery Time</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Delivery times may vary depending on merchant preparation, distance, weather, traffic, and rider availability.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>3. Delivery Address</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Customers must provide a complete and accurate delivery address and contact number. Incorrect details may result in delays or additional charges.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>4. Delivery Fee</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Delivery fees are displayed before order confirmation and may vary depending on distance and other applicable factors.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>5. Order Acceptance</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Orders are subject to merchant availability and may be cancelled if an item is unavailable or the merchant cannot fulfill the order.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>6. Receiving Orders</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Customers should be available to receive their orders and provide a safe and accessible delivery location.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>7. Failed Delivery</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          Additional delivery charges or cancellation may apply if the customer cannot be reached, provides an incorrect address, or refuses the order without a valid reason.
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>8. Delays & Unforeseen Events</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          SukiSend is not responsible for delays caused by circumstances beyond its reasonable control, such as severe weather, road closures, or other emergencies.
        </Text>

        <Text style={[styles.footer, { color: theme.colors.textMuted }]}>
          By placing an order, you agree to this Shipping & Delivery Policy.
        </Text>
      </View>

      {/* ─── Contact Us ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Contact Us</Text>
        <Text style={[styles.body, { color: theme.colors.textMuted }]}>
          For questions, concerns, or support, reach us through:
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>Official Email</Text>
        <Text
          style={[styles.link, { color: theme.colors.primary }]}
          onPress={() => Linking.openURL('mailto:officialsukisend@gmail.com')}
        >
          officialsukisend@gmail.com
        </Text>

        <Text style={[styles.heading, { color: theme.colors.text }]}>Phone Number</Text>
        <Text
          style={[styles.link, { color: theme.colors.primary }]}
          onPress={() => Linking.openURL('tel:09345277662')}
        >
          09345277662
        </Text>
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
    fontWeight: '600',
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
    gap: 6,
    marginTop: 12,
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  body: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  footer: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 10,
  },
  link: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
});
