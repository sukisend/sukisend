import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddressPinMap } from '../../components/AddressPinMap';
import { BrandAlertModal } from '../../components/BrandAlertModal';
import { BrandLogoCard } from '../../components/BrandLogoCard';
import { LogoHeader } from '../../components/LogoHeader';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { ThemeModeToggle } from '../../components/ThemeModeToggle';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useAddressLocations } from '../../hooks/useAddressLocations';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { reverseGeocodePoint } from '../../services/geocodingService';
import { fetchActiveCustomerRestriction, fetchCustomerUnreadSellerMessagesCount } from '../../services/chatModerationService';
import {
  deleteCustomerAddress,
  fetchCustomerAddresses,
  fetchProductById,
  fetchCustomerOrders,
  fetchWishlist,
  saveCustomerAddress,
  setDefaultAddress,
  toggleWishlist,
} from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { CustomerAddress, CustomerRestriction, Order, OrderItem, WishlistItem } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';
import { getProductBasePrice, getVariantUnitPrice } from '../../utils/pricing';

const DEFAULT_FORM = {
  firstName: '',
  lastName: '',
  phone: '+63',
  countryRegion: 'Philippines',
  province: '',
  city: '',
  barangay: '',
  postalCode: '',
  line1: '',
  line2: '',
  latitude: null as number | null,
  longitude: null as number | null,
};

const PURCHASES_PER_PAGE = 3;

const ORDER_STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  refund_requested: 'Refund requested',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

function getOrderProgress(status: Order['status']) {
  const progressMap: Record<Order['status'], number> = {
    pending: 0.12,
    approved: 0.2,
    confirmed: 0.3,
    preparing: 0.4,
    packed: 0.52,
    shipped: 0.68,
    out_for_delivery: 0.82,
    delivered: 0.94,
    completed: 1,
    refund_requested: 1,
    refunded: 1,
    cancelled: 1,
  };
  return progressMap[status] ?? 0;
}

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile, signOut } = useAuth();
  const addItem = useCartStore((state) => state.addItem);
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [activeRestriction, setActiveRestriction] = useState<CustomerRestriction | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [addressForm, setAddressForm] = useState(DEFAULT_FORM);
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressFormExpanded, setAddressFormExpanded] = useState(false);
  const [pinMapVisible, setPinMapVisible] = useState(false);
  const [autoFillFromPinBusy, setAutoFillFromPinBusy] = useState(false);
  const [lastAutoFillPinKey, setLastAutoFillPinKey] = useState('');
  const [purchasePage, setPurchasePage] = useState(1);
  const [selectedPurchase, setSelectedPurchase] = useState<Order | null>(null);
  const { provinceOptions, cityOptions, barangayOptions, loadingLocations, isUsingFallback } = useAddressLocations(
    addressForm.province,
    addressForm.city,
  );

  const pinValue = useMemo(
    () =>
      Number.isFinite(addressForm.latitude) && Number.isFinite(addressForm.longitude)
        ? { latitude: Number(addressForm.latitude), longitude: Number(addressForm.longitude) }
        : null,
    [addressForm.latitude, addressForm.longitude],
  );

  const loadData = useCallback(async () => {
    if (!profile?.id || role !== 'customer') {
      setAddresses([]);
      setWishlist([]);
      setRecentOrders([]);
      setActiveRestriction(null);
      setChatUnreadCount(0);
      return;
    }

    try {
      const [nextAddresses, nextWishlist, nextOrders, restriction, unreadChat] = await Promise.all([
        fetchCustomerAddresses(profile.id),
        fetchWishlist(profile.id),
        fetchCustomerOrders(profile.id),
        fetchActiveCustomerRestriction(profile.id),
        fetchCustomerUnreadSellerMessagesCount(profile.id),
      ]);

      setAddresses(nextAddresses);
      setWishlist(nextWishlist);
      setRecentOrders(nextOrders);
      setActiveRestriction(restriction);
      setChatUnreadCount(unreadChat);
    } catch {
      setAddresses([]);
      setWishlist([]);
      setRecentOrders([]);
      setActiveRestriction(null);
      setChatUnreadCount(0);
    }
  }, [profile?.id, role]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

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

  const totalPurchasePages = useMemo(
    () => Math.max(1, Math.ceil(recentOrders.length / PURCHASES_PER_PAGE)),
    [recentOrders.length],
  );
  const paginatedPurchases = useMemo(() => {
    const start = (purchasePage - 1) * PURCHASES_PER_PAGE;
    return recentOrders.slice(start, start + PURCHASES_PER_PAGE);
  }, [purchasePage, recentOrders]);

  useEffect(() => {
    setPurchasePage((prev) => Math.min(prev, totalPurchasePages));
  }, [totalPurchasePages]);

  const statusColorForPurchase = (status: Order['status']) => {
    if (['completed', 'delivered'].includes(status)) {
      return theme.colors.success;
    }
    if (['cancelled', 'refunded'].includes(status)) {
      return theme.colors.danger;
    }
    if (status === 'out_for_delivery' || status === 'shipped') {
      return theme.colors.primary;
    }
    return theme.colors.warning ?? '#F59E0B';
  };

  const addPurchasedItem = async (item: OrderItem, checkoutNow = false) => {
    try {
      const product = await fetchProductById(item.productId);
      if (!product || !product.isActive) {
        showAlert({
          title: 'Product unavailable',
          message: 'This item is no longer available for purchase.',
          tone: 'info',
        });
        return;
      }

      const matchedVariant = item.variantId
        ? product.variants?.find((variant) => variant.id === item.variantId && variant.isActive)
        : undefined;

      addItem(product, Math.max(1, item.quantity), {
        variantId: matchedVariant?.id,
        variantLabel: matchedVariant
          ? `${matchedVariant.name}: ${matchedVariant.value}`
          : item.variantValue
            ? `${item.variantName ?? 'Variant'}: ${item.variantValue}`
            : undefined,
        unitPrice: matchedVariant ? getVariantUnitPrice(product, matchedVariant) : getProductBasePrice(product),
      });

      if (checkoutNow) {
        setSelectedPurchase(null);
        navigation.navigate('Checkout');
        return;
      }

      showAlert({
        title: 'Added to cart',
        message: `${item.productName} is ready in your cart.`,
        tone: 'success',
        actionLabel: 'View Cart',
        onAction: () => navigation.navigate('CustomerTabs', { screen: 'Cart' }),
      });
    } catch (error) {
      showAlert({
        title: 'Unable to add item',
        message: error instanceof Error ? error.message : 'Please try again.',
        tone: 'error',
      });
    }
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
      return;
    }

    setSavingAddress(true);
    try {
      const editingAddress = editingAddressId ? addresses.find((item) => item.id === editingAddressId) : null;

      await saveCustomerAddress({
        id: editingAddressId ?? undefined,
        customerId: profile.id,
        firstName: addressForm.firstName.trim(),
        lastName: addressForm.lastName.trim(),
        phone: addressForm.phone.trim(),
        countryRegion: addressForm.countryRegion.trim(),
        province: addressForm.province.trim(),
        city: addressForm.city.trim(),
        barangay: addressForm.barangay.trim(),
        postalCode: addressForm.postalCode.trim(),
        line1: addressForm.line1.trim(),
        line2: addressForm.line2.trim() || undefined,
        latitude: Number.isFinite(addressForm.latitude) ? Number(addressForm.latitude) : undefined,
        longitude: Number.isFinite(addressForm.longitude) ? Number(addressForm.longitude) : undefined,
        isDefault: editingAddress?.isDefault ?? addresses.length === 0,
      });
      setAddressForm(DEFAULT_FORM);
      setEditingAddressId(null);
      setAddressFormExpanded(false);
      setPinMapVisible(false);
      await loadData();
    } finally {
      setSavingAddress(false);
    }
  };

  return (
    <ScrollView
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
        },
      ]}
      contentContainerStyle={{
        paddingHorizontal: 14,
        paddingTop: insets.top + 10,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      <LogoHeader />
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Account</Text>
        <ThemeModeToggle compact showLabel={false} />
      </View>

      <BrandLogoCard style={styles.logoCard} />

      {role === 'guest' ? (
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Welcome to SUKI SEND</Text>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>
            Sign in to place orders, save delivery address, manage wishlist, and track purchases.
          </Text>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => navigation.navigate('Auth', { mode: 'signin', intent: 'account' })}
          >
            <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Sign In as Customer</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
            onPress={() => navigation.navigate('Auth', { mode: 'signup', intent: 'account' })}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Create Customer Account</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
            onPress={() => navigation.navigate('Legal')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Security, Privacy & Terms</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Profile</Text>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Name: {profile?.fullName}</Text>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Email: {profile?.email}</Text>
            {activeRestriction ? (
              <Text style={[styles.label, { color: theme.colors.warning ?? '#F59E0B' }]}>
                Account notice: {activeRestriction.reason}
                {activeRestriction.endsAt ? ` (until ${new Date(activeRestriction.endsAt).toLocaleString()})` : ' (permanent)'}
              </Text>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Support</Text>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => navigation.navigate('ChatSeller')}
            >
              <View style={styles.supportButtonContent}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.primaryContrast} />
                <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Chat Seller</Text>
                {chatUnreadCount > 0 ? (
                  <View style={[styles.supportButtonBadge, { backgroundColor: theme.colors.primaryContrast }]}>
                    <Text style={[styles.supportButtonBadgeText, { color: theme.colors.primary }]}>
                      {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
              onPress={() => navigation.navigate('Legal')}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Security, Privacy & Terms</Text>
            </Pressable>
          </View>

          {/* Wishlist — redesigned with clickable cards */}
          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Wishlist {wishlist.length > 0 ? `(${wishlist.length})` : ''}
            </Text>
            {wishlist.length ? (
              <View style={styles.wishlistGrid}>
                {wishlist.map((item) => (
                  <Pressable
                    key={item.id}
                    style={[styles.wishlistCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    onPress={() => {
                      if (item.product) {
                        navigation.navigate('ProductDetail', { product: item.product as any });
                      }
                    }}
                  >
                    <View style={[styles.wishlistImageWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
                      {item.product?.imageUrl ? (
                        <Image source={{ uri: item.product.imageUrl }} style={styles.wishlistImage} />
                      ) : (
                        <Ionicons name="basket-outline" size={20} color={theme.colors.textMuted} />
                      )}
                    </View>
                    <View style={styles.wishlistInfo}>
                      <Text style={[styles.wishlistName, { color: theme.colors.text }]} numberOfLines={2}>
                        {item.product?.name ?? 'Product'}
                      </Text>
                      {item.product?.price ? (
                        <Text style={[styles.wishlistPrice, { color: theme.colors.primary }]}>
                          {formatPHP(getProductBasePrice(item.product))}
                        </Text>
                      ) : null}
                      {item.product ? (
                        <View style={styles.wishlistActions}>
                          <Pressable
                            style={[styles.wishlistActionBtn, { borderColor: theme.colors.border }]}
                            onPress={() => {
                              addItem(item.product!, 1, { unitPrice: getProductBasePrice(item.product!) });
                              showAlert({
                                title: 'Added to cart',
                                message: `${item.product!.name} is ready in your cart.`,
                                tone: 'success',
                                actionLabel: 'View Cart',
                                onAction: () => navigation.navigate('CustomerTabs', { screen: 'Cart' }),
                              });
                            }}
                          >
                            <Text style={[styles.wishlistActionText, { color: theme.colors.text }]}>Add to Cart</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.wishlistActionBtn, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary }]}
                            onPress={() => {
                              addItem(item.product!, 1, { unitPrice: getProductBasePrice(item.product!) });
                              navigation.navigate('Checkout');
                            }}
                          >
                            <Text style={[styles.wishlistActionText, { color: theme.colors.primaryContrast }]}>Checkout</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                    <Pressable
                      style={styles.wishlistRemoveButton}
                      onPress={async () => {
                        if (!profile?.id) return;
                        await toggleWishlist(profile.id, item.productId);
                        await loadData();
                      }}
                    >
                      <Ionicons name="heart" size={18} color={theme.colors.primary} />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>No saved items yet.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Delivery Locations</Text>
            {addresses.map((address) => (
              <View key={address.id} style={[styles.addressCard, { borderColor: theme.colors.border }]}>
                <Text style={[styles.addressTitle, { color: theme.colors.text }]}>
                  {address.firstName} {address.lastName} {address.isDefault ? '(Default)' : ''}
                </Text>
                <Text style={[styles.label, { color: theme.colors.textMuted }]}>
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}, {address.barangay}, {address.city}, {address.province}{' '}
                  {address.postalCode}
                </Text>
                <Text style={[styles.label, { color: theme.colors.textMuted }]}>{address.phone}</Text>
                <View style={styles.inlineActions}>
                  <Pressable
                    style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                    onPress={() => {
                      setAddressForm({
                        firstName: address.firstName,
                        lastName: address.lastName,
                        phone: address.phone,
                        countryRegion: address.countryRegion,
                        province: address.province,
                        city: address.city,
                        barangay: address.barangay,
                        postalCode: address.postalCode,
                        line1: address.line1,
                        line2: address.line2 ?? '',
                        latitude: address.latitude ?? null,
                        longitude: address.longitude ?? null,
                      });
                      setEditingAddressId(address.id);
                      setAddressFormExpanded(true);
                      setPinMapVisible(false);
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Edit</Text>
                  </Pressable>
                  {!address.isDefault ? (
                    <Pressable
                      style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                      onPress={async () => {
                        if (!profile?.id) {
                          return;
                        }
                        await setDefaultAddress(address.id, profile.id);
                        await loadData();
                      }}
                    >
                      <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Set Default</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                    onPress={async () => {
                      await deleteCustomerAddress(address.id);
                      if (editingAddressId === address.id) {
                        setEditingAddressId(null);
                        setAddressForm(DEFAULT_FORM);
                      }
                      await loadData();
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Pressable
              style={styles.addressFormHeader}
              onPress={() =>
                setAddressFormExpanded((prev) => {
                  const next = !prev;
                  if (!next) {
                    setPinMapVisible(false);
                  }
                  return next;
                })
              }
            >
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
                {editingAddressId ? 'Edit Delivery Address' : 'Add New Delivery Address'}
              </Text>
              <Ionicons
                name={addressFormExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={18}
                color={theme.colors.text}
              />
            </Pressable>
            {addressFormExpanded ? (
              <>
                <Text style={[styles.locationHint, { color: theme.colors.textMuted }]}>
                  Tap map to pin your exact delivery location.
                </Text>
                <Pressable
                  style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                  onPress={() => setPinMapVisible((prev) => !prev)}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                    {pinMapVisible ? 'Hide Map Pin Selector' : 'Open Map Pin Selector'}
                  </Text>
                </Pressable>
                {pinMapVisible ? (
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
                ) : (
                  <Text style={[styles.locationHint, { color: theme.colors.textMuted }]}>
                    If the map is slow on your device, keep it hidden and fill address fields manually.
                  </Text>
                )}
                <View style={styles.pinMetaRow}>
                  <Text style={[styles.pinMeta, { color: theme.colors.textMuted }]}>
                    {Number.isFinite(addressForm.latitude) && Number.isFinite(addressForm.longitude)
                      ? `Pinned: ${Number(addressForm.latitude).toFixed(5)}, ${Number(addressForm.longitude).toFixed(5)}`
                      : 'No pinned location yet'}
                  </Text>
                  <Pressable
                    style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                    onPress={async () => {
                      if (!Number.isFinite(addressForm.latitude) || !Number.isFinite(addressForm.longitude)) {
                        return;
                      }

                      const reversed = await reverseGeocodePoint({
                        latitude: Number(addressForm.latitude),
                        longitude: Number(addressForm.longitude),
                      });
                      if (!reversed) {
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
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Auto-fill from pin</Text>
                  </Pressable>
                </View>
                {autoFillFromPinBusy ? (
                  <Text style={[styles.locationHint, { color: theme.colors.textMuted }]}>
                    Detecting address details from your pinned location...
                  </Text>
                ) : null}
                <View style={styles.formRow}>
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

                <TextInput
                  value={addressForm.postalCode}
                  onChangeText={(value) => setAddressForm((prev) => ({ ...prev, postalCode: value }))}
                  placeholder="Postal code"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                />
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
                  style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                  onPress={saveAddress}
                  disabled={savingAddress}
                >
                  <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>
                    {savingAddress ? 'Saving...' : editingAddressId ? 'Update Address' : 'Save Address'}
                  </Text>
                </Pressable>
                {editingAddressId ? (
                  <Pressable
                    style={[styles.secondaryButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => {
                      setEditingAddressId(null);
                      setAddressForm(DEFAULT_FORM);
                      setAddressFormExpanded(false);
                      setPinMapVisible(false);
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Cancel Editing</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={[styles.locationHint, { color: theme.colors.textMuted }]}>Tap to open delivery address form.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Recent Purchases</Text>
            {recentOrders.length ? (
              <>
                <View style={styles.purchaseList}>
                  {paginatedPurchases.map((order) => {
                    const leadItem = order.items[0];
                    const progress = getOrderProgress(order.status);
                    const progressPercent = Math.round(progress * 100);
                    return (
                      <View
                        key={order.id}
                        style={[styles.purchaseCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                      >
                        <View style={styles.purchaseHeader}>
                          <Text style={[styles.purchaseOrderNo, { color: theme.colors.text }]}>{order.orderNo}</Text>
                          <View
                            style={[
                              styles.purchaseStatusBadge,
                              {
                                borderColor: `${statusColorForPurchase(order.status)}44`,
                                backgroundColor: `${statusColorForPurchase(order.status)}1A`,
                              },
                            ]}
                          >
                            <Text style={[styles.purchaseStatusText, { color: statusColorForPurchase(order.status) }]}>
                              {ORDER_STATUS_LABEL[order.status]}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.purchaseMeta, { color: theme.colors.textMuted }]}>
                          Ordered {formatDateTime(order.createdAt)}
                        </Text>
                        <Text style={[styles.purchaseMeta, { color: theme.colors.textMuted }]}>
                          {order.items.length} item(s) - COD Total {formatPHP(order.total)}
                        </Text>
                        <View style={styles.purchasePreview}>
                          {leadItem?.productImageUrl ? (
                            <Image source={{ uri: leadItem.productImageUrl }} style={styles.purchasePreviewImage} />
                          ) : (
                            <View style={[styles.purchasePreviewFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                              <Ionicons name="cube-outline" size={18} color={theme.colors.textMuted} />
                            </View>
                          )}
                          <View style={styles.purchasePreviewInfo}>
                            <Text style={[styles.purchasePreviewName, { color: theme.colors.text }]} numberOfLines={2}>
                              {leadItem?.productName ?? 'Order item'}
                              {leadItem?.variantValue ? ` (${leadItem.variantValue})` : ''}
                            </Text>
                            {order.items.length > 1 ? (
                              <Text style={[styles.purchaseMeta, { color: theme.colors.textMuted }]}>
                                +{order.items.length - 1} more item(s)
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.purchaseProgressRow}>
                          <View style={[styles.purchaseProgressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
                            <View
                              style={[
                                styles.purchaseProgressFill,
                                { width: `${progressPercent}%`, backgroundColor: statusColorForPurchase(order.status) },
                              ]}
                            />
                          </View>
                          <Text style={[styles.purchaseProgressText, { color: theme.colors.textMuted }]}>{progressPercent}%</Text>
                        </View>
                        <View style={styles.purchaseActions}>
                          <Pressable
                            style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                            onPress={() => setSelectedPurchase(order)}
                          >
                            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Details</Text>
                          </Pressable>
                          {leadItem ? (
                            <>
                              <Pressable
                                style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                                onPress={() => addPurchasedItem(leadItem)}
                              >
                                <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Add to Cart</Text>
                              </Pressable>
                              <Pressable
                                style={[styles.secondaryButtonMini, { borderColor: theme.colors.primary }]}
                                onPress={() => addPurchasedItem(leadItem, true)}
                              >
                                <Text style={[styles.secondaryButtonText, { color: theme.colors.primary }]}>Checkout Again</Text>
                              </Pressable>
                            </>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
                {totalPurchasePages > 1 ? (
                  <View style={styles.paginationRow}>
                    <Pressable
                      style={[styles.secondaryButtonMini, styles.paginationButtonMini, { borderColor: theme.colors.border, opacity: purchasePage === 1 ? 0.45 : 1 }]}
                      onPress={() => setPurchasePage((prev) => Math.max(1, prev - 1))}
                      disabled={purchasePage === 1}
                    >
                      <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Previous</Text>
                    </Pressable>
                    <Text style={[styles.paginationLabel, { color: theme.colors.textMuted }]}>
                      Page {purchasePage} of {totalPurchasePages}
                    </Text>
                    <Pressable
                      style={[
                        styles.secondaryButtonMini,
                        styles.paginationButtonMini,
                        { borderColor: theme.colors.border, opacity: purchasePage === totalPurchasePages ? 0.45 : 1 },
                      ]}
                      onPress={() => setPurchasePage((prev) => Math.min(totalPurchasePages, prev + 1))}
                      disabled={purchasePage === totalPurchasePages}
                    >
                      <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Next</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>No order history yet.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <BrandLogoCard
              compact
              title="Secure Session"
              subtitle="Tap below to safely sign out from this device."
              style={styles.signOutLogo}
            />
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.danger }]} onPress={() => signOut()}>
              <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>Sign Out</Text>
            </Pressable>
          </View>
        </>
      )}

      <Modal visible={Boolean(selectedPurchase)} transparent animationType="slide" onRequestClose={() => setSelectedPurchase(null)}>
        <ModalBackdrop align="flex-end" overlayOpacity={0.42}>
          <View style={[styles.purchaseModalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.purchaseModalTitle, { color: theme.colors.text }]}>Purchase Details</Text>
            {selectedPurchase ? (
              <>
                <View style={styles.purchaseHeader}>
                  <Text style={[styles.purchaseOrderNo, { color: theme.colors.text }]}>{selectedPurchase.orderNo}</Text>
                  <Text style={[styles.purchaseStatusText, { color: statusColorForPurchase(selectedPurchase.status) }]}>
                    {ORDER_STATUS_LABEL[selectedPurchase.status]}
                  </Text>
                </View>
                <Text style={[styles.purchaseMeta, { color: theme.colors.textMuted }]}>
                  Ordered {formatDateTime(selectedPurchase.createdAt)}
                </Text>
                {selectedPurchase.shippedAt ? (
                  <Text style={[styles.purchaseMeta, { color: theme.colors.textMuted }]}>
                    Shipped {formatDateTime(selectedPurchase.shippedAt)}
                  </Text>
                ) : null}
                {selectedPurchase.deliveredAt ? (
                  <Text style={[styles.purchaseMeta, { color: theme.colors.textMuted }]}>
                    Delivered {formatDateTime(selectedPurchase.deliveredAt)}
                  </Text>
                ) : null}
                <Text style={[styles.purchaseMeta, { color: theme.colors.textMuted }]} numberOfLines={2}>
                  Address: {selectedPurchase.deliveryAddress}
                </Text>
                <View style={styles.purchaseProgressRow}>
                  <View style={[styles.purchaseProgressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <View
                      style={[
                        styles.purchaseProgressFill,
                        {
                          width: `${Math.round(getOrderProgress(selectedPurchase.status) * 100)}%`,
                          backgroundColor: statusColorForPurchase(selectedPurchase.status),
                        },
                      ]}
                    />
                  </View>
                </View>
                <ScrollView style={styles.purchaseItemList} contentContainerStyle={styles.purchaseItemListContent}>
                  {selectedPurchase.items.map((item) => (
                    <View
                      key={item.id}
                      style={[styles.purchaseItemCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                    >
                      <View style={styles.purchaseItemRow}>
                        {item.productImageUrl ? (
                          <Image source={{ uri: item.productImageUrl }} style={styles.purchaseItemImage} />
                        ) : (
                          <View style={[styles.purchaseItemImage, { backgroundColor: theme.colors.surfaceAlt }]} />
                        )}
                        <View style={styles.purchaseItemInfo}>
                          <Text style={[styles.purchasePreviewName, { color: theme.colors.text }]} numberOfLines={2}>
                            {item.productName}
                            {item.variantValue ? ` (${item.variantValue})` : ''}
                          </Text>
                          <Text style={[styles.purchaseMeta, { color: theme.colors.textMuted }]}>
                            Qty {item.quantity} - {formatPHP(item.lineTotal)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.purchaseActions}>
                        <Pressable
                          style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                          onPress={() => addPurchasedItem(item)}
                        >
                          <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Add to Cart</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.secondaryButtonMini, { borderColor: theme.colors.primary }]}
                          onPress={() => addPurchasedItem(item, true)}
                        >
                          <Text style={[styles.secondaryButtonText, { color: theme.colors.primary }]}>Checkout Again</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.purchaseActions}>
                  <Pressable
                    style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                    onPress={() => {
                      setSelectedPurchase(null);
                      navigation.navigate('CustomerTabs', { screen: 'Orders' });
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Open Order History</Text>
                  </Pressable>
                  <Pressable style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]} onPress={() => setSelectedPurchase(null)}>
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Close</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </ModalBackdrop>
      </Modal>

      <Pressable style={styles.hiddenAccess} onLongPress={() => navigation.navigate('Auth', { mode: 'admin', intent: 'account' })}>
        <Text style={[styles.hiddenAccessText, { color: theme.colors.textMuted }]}>SUKI SEND v1.0.0</Text>
      </Pressable>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  logoCard: {
    marginTop: 12,
  },
  signOutLogo: {
    marginBottom: 2,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 12,
    padding: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  addressFormHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  formRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  purchaseList: {
    gap: 10,
  },
  purchaseCard: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    padding: 10,
  },
  purchaseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  purchaseOrderNo: {
    fontSize: 14,
    fontWeight: '800',
  },
  purchaseStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  purchaseStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  purchaseMeta: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  purchasePreview: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  purchasePreviewImage: {
    borderRadius: 8,
    height: 44,
    width: 44,
  },
  purchasePreviewFallback: {
    alignItems: 'center',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  purchasePreviewInfo: {
    flex: 1,
    minWidth: 0,
  },
  purchasePreviewName: {
    fontSize: 13,
    fontWeight: '700',
  },
  purchaseProgressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  purchaseProgressTrack: {
    borderRadius: 999,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  purchaseProgressFill: {
    borderRadius: 999,
    height: 8,
  },
  purchaseProgressText: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  purchaseActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 2,
  },
  paginationButtonMini: {
    minWidth: 104,
  },
  paginationLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 92,
    textAlign: 'center',
  },
  purchaseModalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '88%',
    padding: 14,
  },
  purchaseModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  purchaseItemList: {
    marginTop: 8,
    maxHeight: 280,
  },
  purchaseItemListContent: {
    gap: 8,
    paddingBottom: 2,
  },
  purchaseItemCard: {
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 8,
  },
  purchaseItemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  purchaseItemImage: {
    borderRadius: 8,
    height: 44,
    width: 44,
  },
  purchaseItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  // Wishlist redesign
  wishlistGrid: {
    gap: 8,
  },
  wishlistCard: {
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  wishlistImageWrap: {
    alignItems: 'center',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  wishlistImage: {
    borderRadius: 8,
    height: 50,
    width: 50,
  },
  wishlistInfo: {
    flex: 1,
    gap: 2,
  },
  wishlistName: {
    fontSize: 13,
    fontWeight: '700',
  },
  wishlistPrice: {
    fontSize: 13,
    fontWeight: '800',
  },
  wishlistRemoveButton: {
    padding: 6,
    position: 'absolute',
    right: 6,
    top: 6,
  },
  wishlistActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    width: '100%',
  },
  wishlistActionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 7,
  },
  wishlistActionText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  // Address
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  addressCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  addressTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 10,
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
  primaryButton: {
    borderRadius: 999,
    marginTop: 4,
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  supportButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  supportButtonBadge: {
    alignItems: 'center',
    borderRadius: 999,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  supportButtonBadgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 11,
  },
  secondaryButtonMini: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  hiddenAccess: {
    marginTop: 12,
    paddingBottom: 10,
    paddingVertical: 8,
  },
  hiddenAccessText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
});
