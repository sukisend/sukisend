import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Image, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AddressPinMap } from '../../components/AddressPinMap';
import { AppTextInput } from '../../components/AppTextInput';
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
} from '../../services/geocodingService';
import { createCodOrder } from '../../services/orderService';
import { fetchCustomerAddresses, saveCustomerAddress, setDefaultAddress } from '../../services/addressService';
import { fetchActiveCustomerRestriction } from '../../services/chatModerationService';
import { validateCoupon, applyCoupon as recordCouponUsage } from '../../services/couponService';
import { fetchDeliveryRatePerKmSetting, fetchFreeShippingThreshold, fetchStoreLocation, fetchDeliveryRadiusMeters, haversineDistanceMeters } from '../../services/settingsService';
import { useCartStore } from '../../store/cartStore';
import { CustomerAddress, CustomerRestriction } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { getProductBasePrice } from '../../utils/pricing';
import { blurActiveWebElement, buildWebInputId } from '../../utils/webAccessibility';

const EMPTY_ADDRESS_FORM = {
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
  const appliedCoupon = useCartStore((state) => state.appliedCoupon);
  const applyCouponToCart = useCartStore((state) => state.applyCoupon);
  const removeCoupon = useCartStore((state) => state.removeCoupon);
  const [placing, setPlacing] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponExpanded, setCouponExpanded] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [isEstimatingFee, setIsEstimatingFee] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [distanceDeliveryFee, setDistanceDeliveryFee] = useState<number | null>(null);
  const [feeEstimateFailed, setFeeEstimateFailed] = useState(false);
  const [deliveryRatePerKm, setDeliveryRatePerKm] = useState(getDeliveryRatePerKm());
  const [activeRestriction, setActiveRestriction] = useState<CustomerRestriction | null>(null);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(0);
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS_FORM);
  const addressFormScrollRef = useRef<ScrollView | null>(null);
  const checkoutFieldScope = useId();
  const { provinceOptions, cityOptions, barangayOptions, loadingLocations, isUsingFallback } = useAddressLocations(
    addressForm.province,
    addressForm.city,
  );
  const getCheckoutInputId = (field: string) => buildWebInputId('checkout', checkoutFieldScope, field);

  const selectedKeys = route.params?.selectedKeys ?? [];
  const paramFreeShippingUnlocked = route.params?.freeShippingUnlocked ?? false;
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
  const checkoutFreeShippingUnlocked = paramFreeShippingUnlocked || (freeShippingThreshold > 0 && checkoutSubtotal >= freeShippingThreshold);
  const selectedAddress = useMemo(
    () => addresses.find((item) => item.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );
  const displayAddresses = useMemo(() => {
    if (!addresses.length) {
      return [];
    }

    if (selectedAddress) {
      return [selectedAddress];
    }

    const defaultAddress = addresses.find((item) => item.isDefault);
    return [defaultAddress ?? addresses[0]];
  }, [addresses, selectedAddress]);
  const perKmRate = deliveryRatePerKm;
  const rawDeliveryFee = distanceDeliveryFee ?? 0;
  const deliveryFee = checkoutFreeShippingUnlocked ? 0 : rawDeliveryFee;
  const discount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const calculated = appliedCoupon.discountType === 'percent'
      ? (checkoutSubtotal * appliedCoupon.discountValue) / 100
      : appliedCoupon.discountValue;
    return Math.min(calculated, checkoutSubtotal);
  }, [appliedCoupon, checkoutSubtotal]);
  const total = Math.max(0, checkoutSubtotal - discount + (checkoutItems.length ? deliveryFee : 0));
  const checkoutCardColor = theme.colors.card;

  const loadCheckoutData = async () => {
    if (!profile?.id) {
      return;
    }

    try {
      const [nextAddresses, nextRate, nextThreshold] = await Promise.all([
        fetchCustomerAddresses(profile.id),
        fetchDeliveryRatePerKmSetting(),
        fetchFreeShippingThreshold(),
      ]);
      const restriction = await fetchActiveCustomerRestriction(profile.id);
      setAddresses(nextAddresses);
      setDeliveryRatePerKm(nextRate);
      setFreeShippingThreshold(nextThreshold);
      setActiveRestriction(restriction);
      setSelectedAddressId(nextAddresses.find((item) => item.isDefault)?.id ?? nextAddresses[0]?.id ?? null);
    } catch {
      setAddresses([]);
      setSelectedAddressId(null);
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

  const openAddressModal = () => {
    setAddressForm(EMPTY_ADDRESS_FORM);
    setAddressModalVisible(true);
  };

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
      const normalize = (value: string | undefined | null) => (value ?? '').trim().toLowerCase();
      const toAddressKey = (item: {
        phone: string;
        province: string;
        city: string;
        barangay: string;
        postalCode: string;
        line1: string;
        line2?: string;
      }) =>
        [
          normalize(item.phone),
          normalize(item.province),
          normalize(item.city),
          normalize(item.barangay),
          normalize(item.postalCode),
          normalize(item.line1),
          normalize(item.line2),
        ].join('|');

      const nextAddressKey = toAddressKey({
        phone: addressForm.phone,
        province: addressForm.province,
        city: addressForm.city,
        barangay: addressForm.barangay,
        postalCode: addressForm.postalCode,
        line1: addressForm.line1,
        line2: addressForm.line2,
      });

      const matchedExisting = addresses.find((item) => {
        const key = toAddressKey({
          phone: item.phone,
          province: item.province,
          city: item.city,
          barangay: item.barangay,
          postalCode: item.postalCode,
          line1: item.line1,
          line2: item.line2,
        });
        return key === nextAddressKey;
      });

      const targetAddressId =
        selectedAddressId && addresses.some((item) => item.id === selectedAddressId)
          ? selectedAddressId
          : matchedExisting?.id;

      const savedAddress = await saveCustomerAddress({
        id: targetAddressId ?? undefined,
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
      setSelectedAddressId(savedAddress.id);
      setAddressForm(EMPTY_ADDRESS_FORM);
      setAddressModalVisible(false);
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

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      showAlert({ title: 'Empty code', message: 'Please enter a coupon code.', tone: 'info' });
      return;
    }
    if (!profile?.id) {
      showAlert({ title: 'Sign in required', message: 'Please sign in to use a coupon.', tone: 'info' });
      return;
    }
    setValidatingCoupon(true);
    try {
      const result = await validateCoupon(couponCode.trim(), profile.id, checkoutSubtotal);
      if (result.valid) {
        applyCouponToCart(result);
        setCouponCode('');
        setCouponExpanded(false);
        Keyboard.dismiss();
        const discountLabel = result.discountType === 'percent'
          ? `${result.discountValue}% off`
          : `${formatPHP(result.discountValue ?? 0)} off`;
        const amountMsg = (result.discountAmount ?? 0) > 0
          ? ` You save ${formatPHP(result.discountAmount ?? 0)}.`
          : '';
        showAlert({ title: 'Coupon applied!', message: `${discountLabel} on your order.${amountMsg}`, tone: 'success' });
      } else {
        showAlert({ title: 'Invalid coupon', message: result.error || 'This coupon is not valid.', tone: 'error' });
      }
    } catch {
      showAlert({ title: 'Error', message: 'Failed to validate coupon. Please try again.', tone: 'error' });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const placeOrder = async () => {
    if (!profile?.id || !selectedAddressId) {
      showAlert({
        title: 'Missing checkout details',
        message: 'Please select your shipping address first.',
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

    const deliveryCheckAddress = addresses.find((a) => a.id === selectedAddressId);
    if (deliveryCheckAddress && Number.isFinite(deliveryCheckAddress.latitude) && Number.isFinite(deliveryCheckAddress.longitude)) {
      try {
        const [store, radiusMeters] = await Promise.all([fetchStoreLocation(), fetchDeliveryRadiusMeters()]);
        const distance = haversineDistanceMeters(store.latitude, store.longitude, Number(deliveryCheckAddress.latitude), Number(deliveryCheckAddress.longitude));
        if (distance > radiusMeters) {
          const kmAway = (distance / 1000).toFixed(1);
          showAlert({
            title: 'Outside delivery area',
            message: `Your location is approximately ${kmAway} km away, which is beyond our ${((radiusMeters / 1000)).toFixed(0)} km delivery range. Please select a different address.`,
            tone: 'error',
          });
          return;
        }
      } catch {
        // Skip radius check on error
      }
    }

    const startedAt = Date.now();
    const itemsToCheckout = [...checkoutItems];
    blurActiveWebElement();
    setPlacing(true);
    try {
      const orderNo = await createCodOrder({
        customerId: profile.id,
        addressId: selectedAddressId,
        shippingMethodId: null,
        items: itemsToCheckout,
        customerNote: customerNote.trim() || undefined,
        deliveryFee,
      });

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, CHECKOUT_ANIMATION_MS - elapsedMs);
      if (remainingMs > 0) {
        await sleep(remainingMs);
      }

      if (appliedCoupon?.couponId) {
        recordCouponUsage(appliedCoupon.couponId, profile.id, orderNo).catch(() => {});
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
      {activeRestriction && ['restricted', 'banned'].includes(activeRestriction.severity) ? (
        <View style={[styles.noticeCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.warning ?? '#F59E0B' }]}>
          <Text style={[styles.noticeTitle, { color: theme.colors.warning ?? '#F59E0B' }]}>Account restriction active</Text>
          <Text style={[styles.noticeText, { color: theme.colors.textMuted }]}>
            {activeRestriction.reason}
            {activeRestriction.endsAt ? ` Until ${new Date(activeRestriction.endsAt).toLocaleString()}.` : ' Permanent restriction.'}
          </Text>
        </View>
      ) : null}

      {/* Shipping Address */}
      <View style={[styles.card, { backgroundColor: checkoutCardColor, borderColor: theme.colors.border }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Shipping Address</Text>
          <Pressable
            style={[styles.addIconBtn, { backgroundColor: theme.colors.primary + '15' }]}
            onPress={openAddressModal}
          >
            <Ionicons name="add" size={18} color={theme.colors.primary} />
          </Pressable>
        </View>
        {addresses.length ? (
          <View style={styles.optionList}>
            {displayAddresses.map((address) => {
              const active = address.id === selectedAddressId;
              return (
                <Pressable
                  key={address.id}
                  style={[
                    styles.optionCard,
                    {
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: active
                        ? theme.colors.surface
                        : theme.isDark
                          ? 'rgba(255,255,255,0.08)'
                          : '#FFFFFF',
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
            {addresses.length > 1 ? (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
                Showing your active delivery address.
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
            No shipping address yet. Tap + to add one.
          </Text>
        )}
      </View>

      {/* Order Note */}
      <View style={[styles.card, { backgroundColor: checkoutCardColor, borderColor: theme.colors.border }]}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>Order note (optional)</Text>
          <Pressable
            style={[styles.addIconBtn, { backgroundColor: theme.colors.primary + '15' }]}
            onPress={() => navigation.navigate('ChatSeller')}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.primary} />
          </Pressable>
        </View>
        <AppTextInput
          nativeID={getCheckoutInputId('order-note')}
          webName="checkout-order-note"
          value={customerNote}
          onChangeText={setCustomerNote}
          placeholder="Special instructions for delivery"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          accessibilityLabel="Order Note"
          style={[
            styles.input,
            styles.multilineInput,
            { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
          ]}
        />
      </View>

      {/* Delivery Fee Breakdown */}
      <View style={[styles.card, { backgroundColor: checkoutCardColor, borderColor: theme.colors.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Delivery Fee</Text>
        {checkoutFreeShippingUnlocked ? (
          <View style={styles.feeRow}>
            <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
            <Text style={[styles.feeText, { color: theme.colors.success, fontWeight: '600' }]}>
              Free delivery unlocked! Subtotal ({formatPHP(checkoutSubtotal)}) ≥ {formatPHP(freeShippingThreshold)}
            </Text>
          </View>
        ) : isEstimatingFee ? (
          <View style={styles.feeRow}>
            <Ionicons name="location-outline" size={14} color={theme.colors.textMuted} />
            <Text style={[styles.feeText, { color: theme.colors.textMuted }]}>Calculating distance...</Text>
          </View>
        ) : feeEstimateFailed ? (
          <View style={styles.feeRow}>
            <Ionicons name="warning-outline" size={14} color={theme.colors.warning} />
            <Text style={[styles.feeText, { color: theme.colors.textMuted }]}>Unable to calculate distance. Showing base fee.</Text>
          </View>
        ) : distanceKm !== null ? (
          <>
            <View style={styles.feeRow}>
              <Ionicons name="navigate-outline" size={14} color={theme.colors.textMuted} />
              <Text style={[styles.feeText, { color: theme.colors.textMuted }]}>
                Distance: {distanceKm} km from store
              </Text>
            </View>
            <View style={styles.feeRow}>
              <Ionicons name="speedometer-outline" size={14} color={theme.colors.textMuted} />
              <Text style={[styles.feeText, { color: theme.colors.textMuted }]}>
                Rate: {formatPHP(perKmRate)}/km
              </Text>
            </View>
            <View style={[styles.feeBreakdownDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.feeRow}>
              <Text style={[styles.feeTotal, { color: theme.colors.text }]}>Delivery Fee</Text>
              <Text style={[styles.feeTotalValue, { color: theme.colors.primary }]}>{formatPHP(deliveryFee)}</Text>
            </View>
          </>
        ) : (
          <View style={styles.feeRow}>
            <Ionicons name="information-circle-outline" size={14} color={theme.colors.textMuted} />
            <Text style={[styles.feeText, { color: theme.colors.textMuted }]}>
              Select a shipping address to see delivery fee breakdown.
            </Text>
          </View>
        )}
      </View>

      {/* Coupon Section */}
      {appliedCoupon ? (
        <View style={[styles.card, { backgroundColor: checkoutCardColor, borderColor: theme.colors.border }]}>
          <View style={styles.couponApplied}>
            <Ionicons name="pricetag" size={14} color={theme.colors.success} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.couponCode, { color: theme.colors.success }]}>{appliedCoupon.code}</Text>
                <Text style={[styles.discountBadge, { backgroundColor: discount > 0 ? theme.colors.success + '15' : theme.colors.surfaceAlt, color: discount > 0 ? theme.colors.success : theme.colors.textMuted }]}>
                  {discount > 0 ? 'Applied' : 'Eligible'}
                </Text>
              </View>
              <Text style={[styles.couponDesc, { color: theme.colors.textMuted }]}>
                {appliedCoupon.description || (
                  appliedCoupon.discountType === 'percent'
                    ? `${appliedCoupon.discountValue}% discount on your order`
                    : `${formatPHP(appliedCoupon.discountValue)} discount on your order`
                )}
              </Text>
              {discount > 0 && (
                <Text style={[styles.couponDesc, { color: theme.colors.success, marginTop: 2 }]}>
                  You save {formatPHP(discount)}
                </Text>
              )}
            </View>
            <Pressable onPress={removeCoupon} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: checkoutCardColor, borderColor: theme.colors.border }]}>
          <Pressable
            style={styles.sectionHeaderRow}
            onPress={() => setCouponExpanded(!couponExpanded)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons name="pricetag-outline" size={15} color={theme.colors.primary} />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Voucher Code</Text>
            </View>
            <Ionicons
              name={couponExpanded ? 'chevron-up' : 'chevron-forward'}
              size={16}
              color={theme.colors.textMuted}
            />
          </Pressable>
          {couponExpanded && (
            <View style={styles.couponInputRow}>
              <TextInput
                style={[styles.couponInput, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                value={couponCode}
                onChangeText={(v) => setCouponCode(v)}
                placeholder="Enter code"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleApplyCoupon}
              />
              <Pressable
                style={[styles.couponApplyBtn, { backgroundColor: validatingCoupon ? theme.colors.surfaceAlt : theme.colors.primary }]}
                disabled={validatingCoupon}
                onPress={handleApplyCoupon}
              >
                <Text style={[styles.couponApplyText, { color: validatingCoupon ? theme.colors.textMuted : '#fff' }]}>
                  {validatingCoupon ? '...' : 'Apply'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Order Summary */}
      <View style={[styles.card, { backgroundColor: checkoutCardColor, borderColor: theme.colors.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Order Summary</Text>
        {checkoutItems.map((item) => {
          const imageUri = item.product.imageUrl || item.product.images?.[0]?.imageUrl;
          const unitPrice = item.unitPrice ?? getProductBasePrice(item.product);
          return (
            <View key={`${item.product.id}-${item.variantId ?? 'default'}`} style={styles.orderItem}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={[styles.orderItemImage, { borderColor: theme.colors.border }]} />
              ) : (
                <View style={[styles.orderItemImage, styles.orderItemFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <Text style={{ fontSize: 16 }}>📦</Text>
                </View>
              )}
              <View style={styles.orderItemInfo}>
                <Text style={[styles.orderItemName, { color: theme.colors.text }]} numberOfLines={1}>
                  {item.product.name}
                </Text>
                {item.variantLabel ? (
                  <Text style={[styles.orderItemVariant, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {item.variantLabel}
                  </Text>
                ) : null}
                <Text style={[styles.orderItemQty, { color: theme.colors.textMuted }]}>
                  Qty: {item.quantity}
                </Text>
              </View>
              <Text style={[styles.orderItemPrice, { color: theme.colors.text }]} numberOfLines={1}>
                {formatPHP(unitPrice * item.quantity)}
              </Text>
            </View>
          );
        })}

        <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />

        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Subtotal</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatPHP(checkoutSubtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Delivery Fee</Text>
          {checkoutFreeShippingUnlocked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.summaryValue, { color: theme.colors.textMuted, textDecorationLine: 'line-through' }]}>
                {formatPHP(rawDeliveryFee)}
              </Text>
              <Text style={[styles.summaryValue, { color: theme.colors.success }]}>FREE</Text>
            </View>
          ) : (
            <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatPHP(deliveryFee)}</Text>
          )}
        </View>
        {appliedCoupon && (
          <View style={styles.summaryRow}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="pricetag" size={12} color={discount > 0 ? theme.colors.success : theme.colors.textMuted} />
              <Text style={[styles.summaryLabel, { color: discount > 0 ? theme.colors.success : theme.colors.textMuted, flex: 0, paddingRight: 0 }]}>
                {appliedCoupon.code}
              </Text>
              <Text style={[styles.discountBadge, { backgroundColor: discount > 0 ? theme.colors.success + '15' : theme.colors.surfaceAlt, color: discount > 0 ? theme.colors.success : theme.colors.textMuted }]}>
                {discount > 0 ? 'Applied' : 'Eligible'}
              </Text>
            </View>
            <Text style={[styles.summaryValue, { color: discount > 0 ? theme.colors.success : theme.colors.textMuted }]}>
              {discount > 0 ? `-${formatPHP(discount)}` : (
                appliedCoupon.discountType === 'percent'
                  ? `${appliedCoupon.discountValue}% off`
                  : `${formatPHP(appliedCoupon.discountValue)} off`
              )}
            </Text>
          </View>
        )}
        <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
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

      {/* Add Address Modal */}
      <Modal visible={addressModalVisible} animationType="slide" transparent onRequestClose={() => setAddressModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 16 }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Add Shipping Address</Text>
              <Pressable onPress={() => setAddressModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              ref={addressFormScrollRef}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Country / Region</Text>
              <AppTextInput
                value={addressForm.countryRegion}
                onChangeText={(value) => setAddressForm((prev) => ({ ...prev, countryRegion: value }))}
                placeholder="Country / Region"
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel="Country / Region"
                autoComplete="country"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />

              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: theme.colors.textMuted }]}>First Name *</Text>
                  <AppTextInput
                    value={addressForm.firstName}
                    onChangeText={(value) => setAddressForm((prev) => ({ ...prev, firstName: value }))}
                    placeholder="First name"
                    placeholderTextColor={theme.colors.textMuted}
                    accessibilityLabel="First Name"
                    autoComplete="given-name"
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: theme.colors.textMuted }]}>Last Name *</Text>
                  <AppTextInput
                    value={addressForm.lastName}
                    onChangeText={(value) => setAddressForm((prev) => ({ ...prev, lastName: value }))}
                    placeholder="Last name"
                    placeholderTextColor={theme.colors.textMuted}
                    accessibilityLabel="Last Name"
                    autoComplete="family-name"
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                  />
                </View>
              </View>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Phone Number *</Text>
              <AppTextInput
                value={addressForm.phone}
                onChangeText={(value) =>
                  setAddressForm((prev) => ({ ...prev, phone: value.startsWith('+63') ? value : `+63${value.replace(/^[+]?63/, '')}` }))
                }
                placeholder="+63"
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel="Phone Number"
                autoComplete="tel"
                keyboardType="phone-pad"
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
                label="Province *"
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
                label="City *"
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
                label="Barangay *"
                placeholder="Select barangay..."
                value={addressForm.barangay}
                options={barangayOptions}
                allowCustom
                onSelect={(value) => setAddressForm((prev) => ({ ...prev, barangay: value }))}
              />

              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Postal Code *</Text>
              <AppTextInput
                value={addressForm.postalCode}
                onChangeText={(value) => setAddressForm((prev) => ({ ...prev, postalCode: value }))}
                placeholder="Postal code"
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel="Postal Code"
                autoComplete="postal-code"
                keyboardType="number-pad"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />

              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Street / House No. / Building *</Text>
              <AppTextInput
                value={addressForm.line1}
                onChangeText={(value) => setAddressForm((prev) => ({ ...prev, line1: value }))}
                placeholder="e.g. 123 Rizal St., Blk 5 Lot 2"
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel="Street Address"
                autoComplete="address-line1"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />

              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Landmark (Optional)</Text>
              <AppTextInput
                value={addressForm.line2}
                onChangeText={(value) => setAddressForm((prev) => ({ ...prev, line2: value }))}
                placeholder="Landmark (optional)"
                placeholderTextColor={theme.colors.textMuted}
                accessibilityLabel="Landmark"
                autoComplete="address-line2"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />

              {/* Map Pin Selector */}
              <Text style={[styles.label, { color: theme.colors.textMuted, marginTop: 4 }]}>Pin Location on Map (Optional)</Text>
              <Text style={[styles.locationHint, { color: theme.colors.textMuted, marginBottom: 8 }]}>
                Move the pin or tap the map to set your exact delivery location.
              </Text>
              <AddressPinMap
                value={
                  addressForm.latitude != null && addressForm.longitude != null
                    ? { latitude: addressForm.latitude, longitude: addressForm.longitude }
                    : null
                }
                onChange={(coord) =>
                  setAddressForm((prev) => ({ ...prev, latitude: coord.latitude, longitude: coord.longitude }))
                }
              />
              {addressForm.latitude != null && addressForm.longitude != null && (
                <Pressable
                  style={styles.clearPinBtn}
                  onPress={() => setAddressForm((prev) => ({ ...prev, latitude: null, longitude: null }))}
                >
                  <Ionicons name="close-circle-outline" size={14} color={theme.colors.textMuted} />
                  <Text style={[styles.clearPinText, { color: theme.colors.textMuted }]}>Clear pin</Text>
                </Pressable>
              )}

              <Pressable
                style={[styles.primaryButton, { backgroundColor: savingAddress ? theme.colors.surfaceAlt : theme.colors.primary, marginTop: 16 }]}
                disabled={savingAddress}
                onPress={saveAddress}
              >
                <Text style={[styles.primaryButtonText, { color: savingAddress ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
                  {savingAddress ? 'Saving Address...' : 'Save Address'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    fontWeight: '600',
  },
  gateSub: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
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
    fontWeight: '600',
  },
  noticeText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  addIconBtn: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
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
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  optionTitle: {
    fontSize: 13,
    fontWeight: '600',
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
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    minHeight: 44,
    textAlignVertical: 'top',
  },
  primaryButton: {
    borderRadius: 999,
    marginTop: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  summaryDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    marginBottom: 4,
  },
  orderItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  orderItemImage: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    width: 48,
  },
  orderItemFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: '600',
  },
  orderItemVariant: {
    fontSize: 11,
    marginTop: 1,
  },
  orderItemQty: {
    fontSize: 11,
    marginTop: 1,
  },
  orderItemPrice: {
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  couponInput: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  couponApplyBtn: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  couponApplyText: { fontSize: 12, fontWeight: '700' },
  couponApplied: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  couponCode: { fontSize: 13, fontWeight: '700' },
  couponDesc: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  discountBadge: {
    borderRadius: 6,
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  feeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  feeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  feeBreakdownDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    marginBottom: 4,
  },
  feeTotal: {
    fontSize: 13,
    fontWeight: '600',
  },
  feeTotalValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  clearPinBtn: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  clearPinText: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalContainer: {
    borderRadius: 18,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    padding: 16,
  },
});
