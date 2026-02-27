import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddressPinMap } from '../../components/AddressPinMap';
import { BrandAlertModal } from '../../components/BrandAlertModal';
import { CheckoutProcessingOverlay } from '../../components/CheckoutProcessingOverlay';
import { EmptyState } from '../../components/EmptyState';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { useAddressLocations } from '../../hooks/useAddressLocations';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  buildAddressQuery,
  computeDeliveryFeeByDistance,
  fetchDrivingRoute,
  geocodeAddress,
  getDeliveryRatePerKm,
  getStoreCoordinates,
  reverseGeocodePoint,
} from '../../services/geocodingService';
import {
  createCodOrder,
  fetchCustomerAddresses,
  fetchShippingMethods,
  saveCustomerAddress,
  setDefaultAddress,
} from '../../services/productService';
import { fetchActiveCustomerRestriction } from '../../services/chatModerationService';
import { fetchDeliveryRatePerKmSetting } from '../../services/settingsService';
import { useCartStore } from '../../store/cartStore';
import { CustomerAddress, CustomerRestriction, ShippingMethod } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { getProductBasePrice } from '../../utils/pricing';

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
  latitude: null as number | null,
  longitude: null as number | null,
};
const CHECKOUT_ANIMATION_MS = 6000;

type CheckoutRoute = RouteProp<CustomerStackParamList, 'Checkout'>;

function getCartItemKey(productId: string, variantId?: string) {
  return `${productId}::${variantId ?? 'default'}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const route = useRoute<CheckoutRoute>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const removeItem = useCartStore((state) => state.removeItem);
  const [placing, setPlacing] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [distanceDeliveryFee, setDistanceDeliveryFee] = useState<number | null>(null);
  const [feeEstimateFailed, setFeeEstimateFailed] = useState(false);
  const [autoFillFromPinBusy, setAutoFillFromPinBusy] = useState(false);
  const [lastAutoFillPinKey, setLastAutoFillPinKey] = useState('');
  const [addressForm, setAddressForm] = useState(DEFAULT_ADDRESS_FORM);
  const [deliveryRatePerKm, setDeliveryRatePerKm] = useState(getDeliveryRatePerKm());
  const [activeRestriction, setActiveRestriction] = useState<CustomerRestriction | null>(null);
  const { provinceOptions, cityOptions, barangayOptions, loadingLocations, isUsingFallback } = useAddressLocations(
    addressForm.province,
    addressForm.city,
  );

  const selectedShipping = useMemo(
    () => shippingMethods.find((item) => item.id === selectedShippingMethodId) ?? null,
    [shippingMethods, selectedShippingMethodId],
  );
  const selectedKeys = route.params?.selectedKeys ?? [];
  const checkoutItems = useMemo(
    () =>
      selectedKeys.length
        ? items.filter((item) => selectedKeys.includes(getCartItemKey(item.product.id, item.variantId)))
        : items,
    [items, selectedKeys],
  );
  const checkoutSubtotal = useMemo(
    () => checkoutItems.reduce((sum, item) => sum + (item.unitPrice ?? getProductBasePrice(item.product)) * item.quantity, 0),
    [checkoutItems],
  );
  const selectedAddress = useMemo(
    () => addresses.find((item) => item.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );
  const pinValue = useMemo(
    () =>
      Number.isFinite(addressForm.latitude) && Number.isFinite(addressForm.longitude)
        ? { latitude: Number(addressForm.latitude), longitude: Number(addressForm.longitude) }
        : null,
    [addressForm.latitude, addressForm.longitude],
  );
  const perKmRate = deliveryRatePerKm;
  const baseDeliveryFee = selectedShipping?.baseFee ?? 0;
  const deliveryFee = distanceDeliveryFee ?? baseDeliveryFee;
  const total = checkoutSubtotal + (checkoutItems.length ? deliveryFee : 0);

  const displayedShippingMethods = useMemo(() => shippingMethods, [shippingMethods]);

  const loadCheckoutData = async () => {
    if (!profile?.id) {
      return;
    }

    try {
      const [nextAddresses, nextShipping, nextRate] = await Promise.all([
        fetchCustomerAddresses(profile.id),
        fetchShippingMethods(),
        fetchDeliveryRatePerKmSetting(),
      ]);
      const restriction = await fetchActiveCustomerRestriction(profile.id);
      setAddresses(nextAddresses);
      setShippingMethods(nextShipping);
      setDeliveryRatePerKm(nextRate);
      setActiveRestriction(restriction);
      setSelectedAddressId(nextAddresses.find((item) => item.isDefault)?.id ?? nextAddresses[0]?.id ?? null);

      setSelectedShippingMethodId(nextShipping[0]?.id ?? null);
    } catch {
      setAddresses([]);
      setShippingMethods([]);
      setSelectedAddressId(null);
      setSelectedShippingMethodId(null);
      setActiveRestriction(null);
    }
  };

  useEffect(() => {
    loadCheckoutData();
  }, [profile?.id]);

  useEffect(() => {
    let mounted = true;

    if (!selectedAddress) {
      setDistanceKm(null);
      setDistanceDeliveryFee(null);
      setFeeEstimateFailed(false);
      return () => {
        mounted = false;
      };
    }

    const geocodeTarget = buildAddressQuery([
      selectedAddress.barangay,
      selectedAddress.city,
      selectedAddress.province,
      selectedAddress.postalCode,
      selectedAddress.countryRegion || 'Philippines',
      selectedAddress.line1,
      selectedAddress.line2,
    ]);

    (async () => {
      setIsEstimatingFee(true);
      setFeeEstimateFailed(false);
      const hasPinnedCoordinates = Number.isFinite(selectedAddress.latitude) && Number.isFinite(selectedAddress.longitude);
      const customerPoint = hasPinnedCoordinates
        ? { latitude: Number(selectedAddress.latitude), longitude: Number(selectedAddress.longitude) }
        : await geocodeAddress(geocodeTarget);
      if (!mounted) {
        return;
      }

      if (!customerPoint) {
        setDistanceKm(null);
        setDistanceDeliveryFee(null);
        setFeeEstimateFailed(true);
        setIsEstimatingFee(false);
        return;
      }

      const storePoint = getStoreCoordinates();
      const route = await fetchDrivingRoute(storePoint, customerPoint);
      if (!mounted) {
        return;
      }

      if (!route) {
        setDistanceKm(null);
        setDistanceDeliveryFee(null);
        setFeeEstimateFailed(true);
        setIsEstimatingFee(false);
        return;
      }

      const km = Number(route.distanceKm.toFixed(2));
      setDistanceKm(km);
      setDistanceDeliveryFee(computeDeliveryFeeByDistance(km, perKmRate));
      setFeeEstimateFailed(false);
      setIsEstimatingFee(false);
    })();

    return () => {
      mounted = false;
    };
  }, [perKmRate, selectedAddress]);

  useEffect(() => {
    if (!pinValue) {
      return;
    }

    const pinKey = `${pinValue.latitude.toFixed(5)},${pinValue.longitude.toFixed(5)}`;
    if (pinKey === lastAutoFillPinKey) {
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        setAutoFillFromPinBusy(true);
        const reversed = await reverseGeocodePoint(pinValue);
        if (!active || !reversed) {
          return;
        }

        setAddressForm((prev) => ({
          ...prev,
          countryRegion: reversed.countryRegion ?? prev.countryRegion,
          province: reversed.province ?? prev.province,
          city: reversed.city ?? prev.city,
          barangay: reversed.barangay ?? prev.barangay,
          postalCode: reversed.postalCode ?? prev.postalCode,
          line1: reversed.line1 ?? reversed.displayName?.split(',')[0] ?? prev.line1,
        }));
        setLastAutoFillPinKey(pinKey);
      } finally {
        if (active) {
          setAutoFillFromPinBusy(false);
        }
      }
    }, 850);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [lastAutoFillPinKey, pinValue]);

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
        latitude: Number.isFinite(addressForm.latitude) ? Number(addressForm.latitude) : undefined,
        longitude: Number.isFinite(addressForm.longitude) ? Number(addressForm.longitude) : undefined,
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

  if (!placing && !checkoutItems.length) {
    return (
      <View style={[styles.emptyWrap, { backgroundColor: theme.colors.background }]}>
        <EmptyState title="No selected items for checkout" subtitle="Go back to cart and select products first." />
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

    if (activeRestriction && ['restricted', 'banned'].includes(activeRestriction.severity)) {
      showAlert({
        title: 'Order blocked',
        message: activeRestriction.endsAt
          ? `Your account is restricted until ${new Date(activeRestriction.endsAt).toLocaleString()}. ${activeRestriction.reason}`
          : `Your account is restricted. ${activeRestriction.reason}`,
        tone: 'error',
      });
      return;
    }

    const startedAt = Date.now();
    const itemsToCheckout = [...checkoutItems];
    setPlacing(true);
    try {
      const orderNo = await createCodOrder({
        customerId: profile.id,
        addressId: selectedAddressId,
        shippingMethodId: selectedShippingMethodId,
        items: itemsToCheckout,
        customerNote: customerNote.trim() || undefined,
        deliveryFee,
      });

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, CHECKOUT_ANIMATION_MS - elapsedMs);
      if (remainingMs > 0) {
        await sleep(remainingMs);
      }

      if (selectedKeys.length) {
        itemsToCheckout.forEach((item) => removeItem(item.product.id, item.variantId));
      } else {
        clearCart();
      }

      showAlert({
        title: 'Order placed successfully',
        message: `Your COD reference number is ${orderNo}.`,
        tone: 'success',
        actionLabel: 'View Orders',
        onAction: () => navigation.navigate('CustomerTabs', { screen: 'Orders' }),
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Failed to place order.';
      const normalized = rawMessage.toLowerCase();
      const message =
        normalized.includes('record "v_variant" is not assigned yet')
          ? 'Supabase checkout function was reverted to an old version. Run the updated supabase/fix_checkout.sql (Feb 26, 2026), then retry.'
          : normalized.includes('p_delivery_fee')
            ? 'Supabase function signature is mismatched. Re-run supabase/fix_checkout.sql (Feb 26, 2026) and refresh the SQL schema cache.'
            : rawMessage;
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
      {activeRestriction && ['restricted', 'banned'].includes(activeRestriction.severity) ? (
        <View style={[styles.noticeCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.warning ?? '#F59E0B' }]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.warning ?? '#F59E0B' }]}>Account restriction active</Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
            {activeRestriction.reason}
            {activeRestriction.endsAt ? ` Until ${new Date(activeRestriction.endsAt).toLocaleString()}.` : ' Permanent restriction.'}
          </Text>
        </View>
      ) : null}

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
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Pin Delivery Location</Text>
        <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
          Tap the map or drag the pin for a more accurate delivery location.
        </Text>
        <AddressPinMap
          value={pinValue}
          onChange={(next) =>
            setAddressForm((prev) => ({
              ...prev,
              latitude: Number(next.latitude.toFixed(7)),
              longitude: Number(next.longitude.toFixed(7)),
            }))
          }
        />
        <View style={styles.pinMetaRow}>
          <Text style={[styles.pinMeta, { color: theme.colors.textMuted }]}>
            {pinValue
              ? `Pinned: ${pinValue.latitude.toFixed(5)}, ${pinValue.longitude.toFixed(5)}`
              : 'No pin selected yet'}
          </Text>
          <Pressable
            style={[styles.pinFillButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
            onPress={async () => {
              if (!pinValue) {
                showAlert({
                  title: 'Pin location first',
                  message: 'Select your location on the map before auto-filling address fields.',
                  tone: 'info',
                });
                return;
              }

              try {
                const reversed = await reverseGeocodePoint(pinValue);
                if (!reversed) {
                  showAlert({
                    title: 'Address lookup unavailable',
                    message: 'We could not auto-fill this location. You can still enter fields manually.',
                    tone: 'info',
                  });
                  return;
                }

                setAddressForm((prev) => ({
                  ...prev,
                  countryRegion: reversed.countryRegion ?? prev.countryRegion,
                  province: reversed.province ?? prev.province,
                  city: reversed.city ?? prev.city,
                  barangay: reversed.barangay ?? prev.barangay,
                  postalCode: reversed.postalCode ?? prev.postalCode,
                  line1: reversed.line1 ?? reversed.displayName?.split(',')[0] ?? prev.line1,
                }));
                showAlert({
                  title: 'Address fields updated',
                  message: 'We auto-filled available details from your pinned location.',
                  tone: 'success',
                });
              } catch (error) {
                showAlert({
                  title: 'Auto-fill failed',
                  message: error instanceof Error ? error.message : 'Unable to fetch address details.',
                  tone: 'error',
                });
              }
            }}
          >
            <Text style={[styles.pinFillButtonText, { color: theme.colors.text }]}>Auto-fill from pin</Text>
          </Pressable>
        </View>
        {autoFillFromPinBusy ? (
          <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
            Detecting address details from your pinned location...
          </Text>
        ) : null}

        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Country / Region</Text>
        <TextInput
          value={addressForm.countryRegion}
          onChangeText={(value) => setAddressForm((prev) => ({ ...prev, countryRegion: value }))}
          placeholder="Country / Region"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>First Name</Text>
            <TextInput
              value={addressForm.firstName}
              onChangeText={(value) => setAddressForm((prev) => ({ ...prev, firstName: value }))}
              placeholder="First name"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
          </View>
          <View style={styles.half}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Last Name</Text>
            <TextInput
              value={addressForm.lastName}
              onChangeText={(value) => setAddressForm((prev) => ({ ...prev, lastName: value }))}
              placeholder="Last name"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
          </View>
        </View>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Phone Number</Text>
        <TextInput
          value={addressForm.phone}
          onChangeText={(value) => setAddressForm((prev) => ({ ...prev, phone: value.startsWith('+63') ? value : `+63${value.replace(/^[+]?63/, '')}` }))}
          placeholder="+63"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <Text style={[styles.locationHint, { color: theme.colors.textMuted }]}>
          {loadingLocations
            ? 'Loading location options...'
            : isUsingFallback
              ? 'Using built-in location list for now.'
              : 'Select province, city, and barangay.'}
        </Text>

        <SearchableDropdown
          label="Province"
          placeholder="Select province..."
          value={addressForm.province}
          options={provinceOptions}
          allowCustom
          onSelect={(value) =>
            setAddressForm((prev) => ({
              ...prev,
              province: value,
              city: '',
              barangay: '',
            }))
          }
        />

        <SearchableDropdown
          label="City"
          placeholder="Select city..."
          value={addressForm.city}
          options={cityOptions}
          allowCustom
          onSelect={(value) =>
            setAddressForm((prev) => ({
              ...prev,
              city: value,
              barangay: '',
            }))
          }
        />

        <SearchableDropdown
          label="Barangay"
          placeholder="Select barangay..."
          value={addressForm.barangay}
          options={barangayOptions}
          allowCustom
          onSelect={(value) => setAddressForm((prev) => ({ ...prev, barangay: value }))}
        />

        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Postal Code</Text>
        <TextInput
          value={addressForm.postalCode}
          onChangeText={(value) => setAddressForm((prev) => ({ ...prev, postalCode: value }))}
          placeholder="Postal code"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Complete Address</Text>
        <TextInput
          value={addressForm.line1}
          onChangeText={(value) => setAddressForm((prev) => ({ ...prev, line1: value }))}
          placeholder="Complete address"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Landmark (Optional)</Text>
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
          {displayedShippingMethods.map((method) => {
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
                  Fee: {formatPHP(distanceDeliveryFee ?? method.baseFee)}
                  {method.etaMinDays !== undefined && method.etaMaxDays !== undefined
                    ? ` | ETA ${method.etaMinDays}-${method.etaMaxDays} day(s)`
                    : ''}
                </Text>
                <Text style={[styles.optionSub, { color: theme.colors.textMuted }]}>
                  {isEstimatingFee
                    ? 'Estimating route distance...'
                    : feeEstimateFailed
                      ? `Distance lookup unavailable, using base fee.`
                      : distanceKm !== null
                        ? `Distance ${distanceKm.toFixed(2)} km | Rate ${formatPHP(perKmRate)}/km`
                        : `Rate ${formatPHP(perKmRate)}/km`}
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
        {checkoutItems.map((item) => (
          <View key={`${item.product.id}-${item.variantId ?? 'default'}`} style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
              {item.product.name}
              {item.variantLabel ? ` (${item.variantLabel})` : ''} x{item.quantity}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
              {formatPHP((item.unitPrice ?? getProductBasePrice(item.product)) * item.quantity)}
            </Text>
          </View>
        ))}

        <View style={[styles.summaryRow, styles.divider]}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Subtotal</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatPHP(checkoutSubtotal)}</Text>
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
      <CheckoutProcessingOverlay visible={placing} />
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
  noticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
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
  pinMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  pinMeta: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
  },
  pinFillButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pinFillButtonText: {
    fontSize: 12,
    fontWeight: '700',
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
    minWidth: 0,
  },
  locationHint: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: -2,
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
