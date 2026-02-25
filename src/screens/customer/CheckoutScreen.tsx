import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { EmptyState } from '../../components/EmptyState';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  createCodOrder,
  fetchCustomerAddresses,
  fetchShippingMethods,
  saveCustomerAddress,
  setDefaultAddress,
} from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { CustomerAddress, ShippingMethod } from '../../types/models';
import { formatPHP } from '../../utils/currency';

const DEFAULT_ADDRESS_FORM = {
  countryRegion: 'Philippines',
  firstName: '',
  lastName: '',
  phone: '+63',
  province: '',
  city: '',
  barangay: '',
  postalCode: '',
  line1: '',
  line2: '',
};

export function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore((state) => state.subtotal());
  const clearCart = useCartStore((state) => state.clearCart);
  const [placing, setPlacing] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState(DEFAULT_ADDRESS_FORM);

  const selectedShipping = useMemo(
    () => shippingMethods.find((item) => item.id === selectedShippingMethodId) ?? null,
    [shippingMethods, selectedShippingMethodId],
  );
  const deliveryFee = selectedShipping?.baseFee ?? 0;
  const total = subtotal + (items.length ? deliveryFee : 0);

  const loadCheckoutData = async () => {
    if (!profile?.id) {
      return;
    }

    try {
      const [nextAddresses, nextShipping] = await Promise.all([
        fetchCustomerAddresses(profile.id),
        fetchShippingMethods(),
      ]);
      setAddresses(nextAddresses);
      setShippingMethods(nextShipping);
      setSelectedAddressId(nextAddresses.find((item) => item.isDefault)?.id ?? nextAddresses[0]?.id ?? null);
      setSelectedShippingMethodId(nextShipping[0]?.id ?? null);
    } catch {
      setAddresses([]);
      setShippingMethods([]);
      setSelectedAddressId(null);
      setSelectedShippingMethodId(null);
    }
  };

  useEffect(() => {
    loadCheckoutData();
  }, [profile?.id]);

  const saveAddress = async () => {
    if (!profile?.id) {
      return;
    }

    if (
      !addressForm.firstName.trim() ||
      !addressForm.lastName.trim() ||
      !addressForm.phone.trim() ||
      !addressForm.province.trim() ||
      !addressForm.city.trim() ||
      !addressForm.barangay.trim() ||
      !addressForm.postalCode.trim() ||
      !addressForm.line1.trim()
    ) {
      showAlert({
        title: 'Incomplete address',
        message: 'Please complete all required shipping address fields.',
        tone: 'info',
      });
      return;
    }

    setSavingAddress(true);
    try {
      await saveCustomerAddress({
        customerId: profile.id,
        isDefault: true,
        countryRegion: addressForm.countryRegion.trim(),
        firstName: addressForm.firstName.trim(),
        lastName: addressForm.lastName.trim(),
        phone: addressForm.phone.trim(),
        province: addressForm.province.trim(),
        city: addressForm.city.trim(),
        barangay: addressForm.barangay.trim(),
        postalCode: addressForm.postalCode.trim(),
        line1: addressForm.line1.trim(),
        line2: addressForm.line2.trim() || undefined,
      });
      setAddressForm(DEFAULT_ADDRESS_FORM);
      await loadCheckoutData();
      showAlert({
        title: 'Address saved',
        message: 'Your delivery address is ready for checkout.',
        tone: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save address.';
      showAlert({
        title: 'Address save failed',
        message,
        tone: 'error',
      });
    } finally {
      setSavingAddress(false);
    }
  };

  if (!items.length) {
    return (
      <View style={[styles.emptyWrap, { backgroundColor: theme.colors.background }]}>
        <EmptyState title="No items for checkout" subtitle="Go back and add products to your cart first." />
        <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
      </View>
    );
  }

  if (role === 'guest') {
    return (
      <View style={[styles.emptyWrap, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.gateCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.gateTitle, { color: theme.colors.text }]}>Sign in to place your order</Text>
          <Text style={[styles.gateSub, { color: theme.colors.textMuted }]}>
            For secure delivery and order tracking, please sign in first.
          </Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => navigation.navigate('Auth', { mode: 'signin', intent: 'checkout' })}
          >
            <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Sign In / Sign Up</Text>
          </Pressable>
        </View>
        <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
      </View>
    );
  }

  const placeOrder = async () => {
    if (!profile?.id || !selectedAddressId || !selectedShippingMethodId) {
      showAlert({
        title: 'Missing checkout details',
        message: 'Please select your address and shipping option first.',
        tone: 'info',
      });
      return;
    }

    setPlacing(true);
    try {
      const orderNo = await createCodOrder({
        customerId: profile.id,
        addressId: selectedAddressId,
        shippingMethodId: selectedShippingMethodId,
        items,
        customerNote: customerNote.trim() || undefined,
      });

      clearCart();
      showAlert({
        title: 'Order placed successfully',
        message: `Your COD reference number is ${orderNo}.`,
        tone: 'success',
        actionLabel: 'View Orders',
        onAction: () => navigation.navigate('CustomerTabs', { screen: 'Orders' }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to place order.';
      showAlert({
        title: 'Checkout failed',
        message,
        tone: 'error',
      });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>COD Checkout</Text>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Shipping Address</Text>
        {addresses.length ? (
          <View style={styles.optionList}>
            {addresses.map((address) => {
              const active = address.id === selectedAddressId;
              return (
                <Pressable
                  key={address.id}
                  style={[
                    styles.optionCard,
                    {
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: active ? theme.colors.surfaceAlt : theme.colors.surface,
                    },
                  ]}
                  onPress={async () => {
                    setSelectedAddressId(address.id);
                    try {
                      await setDefaultAddress(address.id, profile?.id ?? '');
                    } catch {
                      // Keep selection local even if default sync fails.
                    }
                  }}
                >
                  <Text style={[styles.optionTitle, { color: theme.colors.text }]}>
                    {address.firstName} {address.lastName}
                  </Text>
                  <Text style={[styles.optionSub, { color: theme.colors.textMuted }]}>
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}, {address.barangay}, {address.city}, {address.province}{' '}
                    {address.postalCode}
                  </Text>
                  <Text style={[styles.optionSub, { color: theme.colors.textMuted }]}>{address.phone}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
            No shipping address yet. Add one below to continue checkout.
          </Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Add Address</Text>
        <View style={styles.row}>
          <TextInput
            value={addressForm.firstName}
            onChangeText={(value) => setAddressForm((prev) => ({ ...prev, firstName: value }))}
            placeholder="First name"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <TextInput
            value={addressForm.lastName}
            onChangeText={(value) => setAddressForm((prev) => ({ ...prev, lastName: value }))}
            placeholder="Last name"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>
        <TextInput
          value={addressForm.phone}
          onChangeText={(value) => setAddressForm((prev) => ({ ...prev, phone: value.startsWith('+63') ? value : `+63${value.replace(/^[+]?63/, '')}` }))}
          placeholder="+63"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <View style={styles.row}>
          <TextInput
            value={addressForm.province}
            onChangeText={(value) => setAddressForm((prev) => ({ ...prev, province: value }))}
            placeholder="Province"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <TextInput
            value={addressForm.city}
            onChangeText={(value) => setAddressForm((prev) => ({ ...prev, city: value }))}
            placeholder="City"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>
        <View style={styles.row}>
          <TextInput
            value={addressForm.barangay}
            onChangeText={(value) => setAddressForm((prev) => ({ ...prev, barangay: value }))}
            placeholder="Barangay"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <TextInput
            value={addressForm.postalCode}
            onChangeText={(value) => setAddressForm((prev) => ({ ...prev, postalCode: value }))}
            placeholder="Postal code"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>
        <TextInput
          value={addressForm.line1}
          onChangeText={(value) => setAddressForm((prev) => ({ ...prev, line1: value }))}
          placeholder="Complete address"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <TextInput
          value={addressForm.line2}
          onChangeText={(value) => setAddressForm((prev) => ({ ...prev, line2: value }))}
          placeholder="Landmark (optional)"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <Pressable
          style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
          onPress={saveAddress}
          disabled={savingAddress}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
            {savingAddress ? 'Saving Address...' : 'Save Address'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Shipping Option</Text>
        <View style={styles.optionList}>
          {shippingMethods.map((method) => {
            const active = method.id === selectedShippingMethodId;
            return (
              <Pressable
                key={method.id}
                style={[
                  styles.optionCard,
                  {
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                    backgroundColor: active ? theme.colors.surfaceAlt : theme.colors.surface,
                  },
                ]}
                onPress={() => setSelectedShippingMethodId(method.id)}
              >
                <Text style={[styles.optionTitle, { color: theme.colors.text }]}>{method.name}</Text>
                <Text style={[styles.optionSub, { color: theme.colors.textMuted }]}>
                  {method.description || 'Shipping service'}
                </Text>
                <Text style={[styles.optionSub, { color: theme.colors.textMuted }]}>
                  Fee: {formatPHP(method.baseFee)}
                  {method.etaMinDays !== undefined && method.etaMaxDays !== undefined
                    ? ` | ETA ${method.etaMinDays}-${method.etaMaxDays} day(s)`
                    : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Order note (optional)</Text>
        <TextInput
          value={customerNote}
          onChangeText={setCustomerNote}
          placeholder="Special instructions for delivery"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          style={[
            styles.input,
            styles.multilineInput,
            { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
          ]}
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Order Summary</Text>
        {items.map((item) => (
          <View key={`${item.product.id}-${item.variantId ?? 'default'}`} style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
              {item.product.name}
              {item.variantLabel ? ` (${item.variantLabel})` : ''} x{item.quantity}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {formatPHP((item.unitPrice ?? item.product.price) * item.quantity)}
            </Text>
          </View>
        ))}

        <View style={[styles.summaryRow, styles.divider]}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Subtotal</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatPHP(subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Delivery Fee</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatPHP(deliveryFee)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.totalLabel, { color: theme.colors.text }]}>Total</Text>
          <Text style={[styles.totalValue, { color: theme.colors.primary }]}>{formatPHP(total)}</Text>
        </View>
      </View>

      <Pressable
        style={[styles.primaryButton, { backgroundColor: placing ? theme.colors.surfaceAlt : theme.colors.primary }]}
        disabled={placing}
        onPress={placeOrder}
      >
        <Text style={[styles.primaryButtonText, { color: placing ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
          {placing ? 'Placing Order...' : 'Place COD Order'}
        </Text>
      </Pressable>

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
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 14,
  },
  gateCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  gateTitle: {
    fontSize: 19,
    fontWeight: '900',
  },
  gateSub: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  helper: {
    fontSize: 13,
    fontWeight: '500',
  },
  optionList: {
    gap: 8,
  },
  optionCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  optionSub: {
    fontSize: 12,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  half: {
    flex: 1,
  },
  multilineInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  divider: {
    marginTop: 10,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingRight: 10,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  primaryButton: {
    borderRadius: 999,
    marginTop: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
