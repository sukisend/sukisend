import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddressPinMap } from '../../components/AddressPinMap';
import { AppTextInput } from '../../components/AppTextInput';
import { BrandAlertModal } from '../../components/BrandAlertModal';
import { BrandLogoCard } from '../../components/BrandLogoCard';
import { LogoHeader } from '../../components/LogoHeader';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useAddressLocations } from '../../hooks/useAddressLocations';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { supabase } from '../../lib/supabase';
import { reverseGeocodePoint } from '../../services/geocodingService';
import { fetchActiveCustomerRestriction, fetchCustomerUnreadSellerMessagesCount } from '../../services/chatModerationService';
import { fetchProductById } from '../../services/productService';
import { pickAndUploadAvatar } from '../../services/mediaService';
import { fetchCustomerAddresses, deleteCustomerAddress, saveCustomerAddress, setDefaultAddress } from '../../services/addressService';
import { fetchCustomerOrders } from '../../services/orderService';
import { fetchStoreLocation, fetchDeliveryRadiusMeters, haversineDistanceMeters } from '../../services/settingsService';
import { fetchWishlist, toggleWishlist } from '../../services/wishlistService';
import { useCartStore } from '../../store/cartStore';
import { CustomerAddress, CustomerRestriction, Order, OrderItem, WishlistItem } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';
import { getProductBasePrice, getVariantUnitPrice } from '../../utils/pricing';
import { buildWebInputId } from '../../utils/webAccessibility';

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
const WISHLIST_PER_PAGE = 5;

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
  const { role, profile, signOut, refreshProfile } = useAuth();
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
  const [autoFillFromPinBusy, setAutoFillFromPinBusy] = useState(false);
  const [lastAutoFillPinKey, setLastAutoFillPinKey] = useState('');
  const [purchasePage, setPurchasePage] = useState(1);
  const [wishlistPage, setWishlistPage] = useState(1);
  const [selectedPurchase, setSelectedPurchase] = useState<Order | null>(null);
  const [editProfileExpanded, setEditProfileExpanded] = useState(false);
  const [profileFullName, setProfileFullName] = useState('');
  const [profileContact, setProfileContact] = useState('');
  const [profileBirthdate, setProfileBirthdate] = useState('');
  const [profileBarangay, setProfileBarangay] = useState('');
  const [profileMunicipality, setProfileMunicipality] = useState('');
  const [profileProvince, setProfileProvince] = useState('');
  const [profileSitio, setProfileSitio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileSecretQuestion, setProfileSecretQuestion] = useState('');
  const [profileSecretAnswer, setProfileSecretAnswer] = useState('');
  const [showSecretDropdown, setShowSecretDropdown] = useState(false);
  const profileFormInited = useRef(false);
  const prevProfileIdRef = useRef<string | null>(null);
  const [currentSecretAnswer, setCurrentSecretAnswer] = useState('');
  const [showBdDatePicker, setShowBdDatePicker] = useState(false);
  const [bdPickerMonth, setBdPickerMonth] = useState(0);
  const [bdPickerDay, setBdPickerDay] = useState(1);
  const [bdPickerYear, setBdPickerYear] = useState(new Date().getFullYear() - 18);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const accountFieldScope = useId();
  const { provinceOptions, cityOptions, barangayOptions, loadingLocations, isUsingFallback } = useAddressLocations(
    addressForm.province,
    addressForm.city,
  );
  const getAccountInputId = (field: string) => buildWebInputId('account', accountFieldScope, field);

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
    if (profile && profile.id !== prevProfileIdRef.current) {
      prevProfileIdRef.current = profile.id;
      setProfileFullName(profile.fullName || '');
      setProfileContact(profile.contactNumber || '');
      setProfileBirthdate(profile.birthdate || '');
      setProfileBarangay(profile.barangay || '');
      setProfileMunicipality(profile.municipality || '');
      setProfileProvince(profile.province || '');
      setProfileSitio(profile.sitio || '');
      setProfileSecretQuestion(profile.secretQuestion || '');
      setProfileSecretAnswer(profile.secretAnswer || '');
      setCurrentSecretAnswer('');
    }
  }, [profile]);

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

  const totalWishlistPages = useMemo(
    () => Math.max(1, Math.ceil(wishlist.length / WISHLIST_PER_PAGE)),
    [wishlist.length],
  );
  const paginatedWishlist = useMemo(() => {
    const start = (wishlistPage - 1) * WISHLIST_PER_PAGE;
    return wishlist.slice(start, start + WISHLIST_PER_PAGE);
  }, [wishlistPage, wishlist]);

  useEffect(() => {
    setPurchasePage((prev) => Math.min(prev, totalPurchasePages));
  }, [totalPurchasePages]);

  useEffect(() => {
    setWishlistPage((prev) => Math.min(prev, totalWishlistPages));
  }, [totalWishlistPages]);

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

  const saveProfile = async () => {
    if (!profile?.id || !supabase) return;
    if (!profileFullName.trim()) {
      showAlert({ title: 'Missing name', message: 'Full name is required.', tone: 'info' });
      return;
    }
    const secretChanged =
      profileSecretQuestion.trim() !== (profile?.secretQuestion || '') ||
      profileSecretAnswer.trim() !== (profile?.secretAnswer || '');
    if (secretChanged && profile?.secretQuestion) {
      if (!currentSecretAnswer.trim()) {
        showAlert({ title: 'Current answer required', message: 'Please enter your current secret answer to change it.', tone: 'info' });
        return;
      }
      if (currentSecretAnswer.trim().toLowerCase() !== (profile?.secretAnswer || '').toLowerCase()) {
        showAlert({ title: 'Wrong answer', message: 'Your current secret answer is incorrect.', tone: 'error' });
        return;
      }
    }
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profileFullName.trim(),
          contact_number: profileContact.trim(),
          birthdate: profileBirthdate.trim() || null,
          sitio: profileSitio.trim(),
          barangay: profileBarangay.trim(),
          municipality: profileMunicipality.trim(),
          province: profileProvince.trim(),
          secret_question: profileSecretQuestion.trim(),
          secret_answer: profileSecretAnswer.trim(),
        })
        .eq('id', profile.id);
      if (error) throw error;
      showAlert({ title: 'Profile updated', message: 'Your profile has been saved.', tone: 'success' });
      setEditProfileExpanded(false);
      setCurrentSecretAnswer('');
      refreshProfile();
    } catch (err) {
      showAlert({ title: 'Update failed', message: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword.trim()) {
      showAlert({ title: 'Missing password', message: 'Please enter your current password.', tone: 'info' });
      return;
    }
    if (!/^\d{8}$/.test(newPassword)) {
      showAlert({ title: 'Invalid password', message: 'New password must be exactly 8 numerical digits.', tone: 'info' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showAlert({ title: 'Passwords do not match', message: 'Please re-type your new password to confirm.', tone: 'info' });
      return;
    }
    if (newPassword === currentPassword) {
      showAlert({ title: 'Same password', message: 'New password must be different from your current password.', tone: 'info' });
      return;
    }
    setChangingPassword(true);
    try {
      if (!supabase || !profile?.email) return;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });
      if (signInError) {
        showAlert({ title: 'Wrong password', message: 'Your current password is incorrect.', tone: 'error' });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showAlert({ title: 'Password changed', message: 'Your password has been updated successfully.', tone: 'success' });
      setShowChangePasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      showAlert({ title: 'Change failed', message: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!profile?.id || !supabase) return;
    try {
      setUploadingAvatar(true);
      const url = await pickAndUploadAvatar({ folder: `avatars/${profile.id}` });
      if (!url) return;
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
      if (error) throw error;
      showAlert({ title: 'Photo updated', message: 'Your profile photo has been changed.', tone: 'success' });
      refreshProfile();
    } catch (err) {
      showAlert({ title: 'Upload failed', message: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveAddress = async () => {
    if (!profile?.id) {
      return;
    }

    const missing: string[] = [];
    if (!addressForm.firstName.trim()) missing.push('First name');
    if (!addressForm.lastName.trim()) missing.push('Last name');
    if (!addressForm.phone.trim()) missing.push('Phone number');
    if (!addressForm.province.trim()) missing.push('Province');
    if (!addressForm.city.trim()) missing.push('City');
    if (!addressForm.barangay.trim()) missing.push('Barangay');
    if (!addressForm.postalCode.trim()) missing.push('Postal code');
    if (!addressForm.line1.trim()) missing.push('Complete address');

    if (missing.length > 0) {
      showAlert({
        title: 'Incomplete address',
        message: `Please fill in: ${missing.join(', ')}.`,
        tone: 'info',
      });
      return;
    }

    // Check delivery radius if pin is available
    if (Number.isFinite(addressForm.latitude) && Number.isFinite(addressForm.longitude)) {
      try {
        const [store, radiusMeters] = await Promise.all([fetchStoreLocation(), fetchDeliveryRadiusMeters()]);
        const distance = haversineDistanceMeters(store.latitude, store.longitude, Number(addressForm.latitude), Number(addressForm.longitude));
        if (distance > radiusMeters) {
          const kmAway = (distance / 1000).toFixed(1);
          showAlert({
            title: 'Outside delivery area',
            message: `Your location is approximately ${kmAway} km away, which is beyond our ${((radiusMeters / 1000)).toFixed(0)} km delivery range. We're not available in your area yet, but we hope to expand there soon!`,
            tone: 'info',
          });
          return;
        }
      } catch {
        // Skip radius check on error — allow save
      }
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
            <View style={styles.profileHeader}>
              <Pressable style={styles.avatarWrap} onPress={handleAvatarUpload} disabled={uploadingAvatar}>
                {uploadingAvatar ? (
                  <View style={[styles.avatarCircle, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  </View>
                ) : profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarCircle, { backgroundColor: theme.colors.primary + '15' }]}>
                    <Ionicons name="person" size={28} color={theme.colors.primary} />
                  </View>
                )}
                <View style={[styles.avatarEditBadge, { backgroundColor: theme.colors.primary }]}>
                  <Ionicons name="camera" size={10} color="#FFF" />
                </View>
              </Pressable>
              <View style={styles.profileHeaderText}>
                <Text style={[styles.profileName, { color: theme.colors.text }]}>{profile?.fullName}</Text>
                <Text style={[styles.profileUsername, { color: theme.colors.textMuted }]}>@{profile?.username}</Text>
              </View>
            </View>

            {activeRestriction ? (
              <View style={[styles.restrictionBanner, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <Ionicons name="warning" size={14} color="#D97706" />
                <Text style={{ color: '#92400E', flex: 1, fontSize: 12 }}>
                  {activeRestriction.reason}
                  {activeRestriction.endsAt ? ` (until ${new Date(activeRestriction.endsAt).toLocaleDateString()})` : ''}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.editProfileToggle, { borderColor: theme.colors.border }]}
              onPress={() => setEditProfileExpanded(!editProfileExpanded)}
            >
              <Ionicons name={editProfileExpanded ? 'chevron-up' : 'create-outline'} size={16} color={theme.colors.primary} />
              <Text style={[styles.editProfileToggleText, { color: theme.colors.primary }]}>
                {editProfileExpanded ? 'Close' : 'Edit Profile'}
              </Text>
            </Pressable>

            {editProfileExpanded && (
              <View style={styles.profileForm}>
                <View style={styles.profileSectionHeader}>
                  <Ionicons name="person-outline" size={13} color={theme.colors.primary} />
                  <Text style={[styles.profileSectionTitle, { color: theme.colors.text }]}>Personal Info</Text>
                </View>

                <AppTextInput
                  value={profileFullName}
                  onChangeText={setProfileFullName}
                  placeholder="Full name"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                />

                <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Contact Number</Text>
                <AppTextInput
                  value={profileContact}
                  onChangeText={setProfileContact}
                  placeholder="e.g. +639123456789"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="phone-pad"
                  style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                />

                <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Birthdate</Text>
                <Pressable
                  style={[styles.profileInput, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => {
                    if (profileBirthdate) {
                      const parts = profileBirthdate.split('-');
                      if (parts.length === 3) {
                        setBdPickerYear(parseInt(parts[0], 10));
                        setBdPickerMonth(parseInt(parts[1], 10) - 1);
                        setBdPickerDay(parseInt(parts[2], 10));
                      }
                    }
                    setShowBdDatePicker(true);
                  }}
                >
                  <Text style={{ color: profileBirthdate ? theme.colors.text : theme.colors.textMuted, fontSize: 13 }}>
                    {profileBirthdate || 'Select date'}
                  </Text>
                  <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                </Pressable>

                <View style={styles.profileSectionHeader}>
                  <Ionicons name="location-outline" size={13} color={theme.colors.primary} />
                  <Text style={[styles.profileSectionTitle, { color: theme.colors.text }]}>Address</Text>
                </View>

                <AppTextInput
                  value={profileSitio}
                  onChangeText={setProfileSitio}
                  placeholder="Sitio (optional)"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                />
                <AppTextInput
                  value={profileBarangay}
                  onChangeText={setProfileBarangay}
                  placeholder="Barangay"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                />
                <View style={styles.profileRow}>
                  <View style={styles.profileHalfField}>
                    <AppTextInput
                      value={profileMunicipality}
                      onChangeText={setProfileMunicipality}
                      placeholder="Municipality"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                    />
                  </View>
                  <View style={styles.profileHalfField}>
                    <AppTextInput
                      value={profileProvince}
                      onChangeText={setProfileProvince}
                      placeholder="Province"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                    />
                  </View>
                </View>

                <View style={styles.profileSectionHeader}>
                  <Ionicons name="lock-closed-outline" size={13} color={theme.colors.primary} />
                  <Text style={[styles.profileSectionTitle, { color: theme.colors.text }]}>Account</Text>
                </View>

                <View style={[styles.readOnlyField, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                  <Text style={[styles.readOnlyLabel, { color: theme.colors.textMuted }]}>Username</Text>
                  <Text style={[styles.readOnlyValue, { color: theme.colors.text }]}>@{profile?.username}</Text>
                </View>

                <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Secret Question</Text>
                <View style={styles.secretDropdownContainer}>
                  <Pressable
                    style={[styles.secretDropdownTrigger, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                    onPress={() => setShowSecretDropdown(!showSecretDropdown)}
                  >
                    <Text
                      style={[styles.secretDropdownText, { color: profileSecretQuestion ? theme.colors.text : theme.colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {profileSecretQuestion || 'Select a secret question'}
                    </Text>
                    <Ionicons name={showSecretDropdown ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textMuted} />
                  </Pressable>
                  {showSecretDropdown && (
                    <View style={[styles.secretDropdownList, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled showsVerticalScrollIndicator>
                        {SECRET_QUESTIONS.map((question) => {
                          const selected = profileSecretQuestion === question;
                          return (
                            <Pressable
                              key={question}
                              style={[styles.secretDropdownItem, { backgroundColor: selected ? theme.colors.primary + '12' : 'transparent' }]}
                              onPress={() => {
                                setProfileSecretQuestion(selected ? '' : question);
                                setShowSecretDropdown(false);
                              }}
                            >
                              <Ionicons
                                name={selected ? 'radio-button-on' : 'radio-button-off'}
                                size={14}
                                color={selected ? theme.colors.primary : theme.colors.textMuted}
                              />
                              <Text style={[styles.secretDropdownItemText, { color: selected ? theme.colors.primary : theme.colors.text }]} numberOfLines={2}>
                                {question}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Secret Answer</Text>
                <AppTextInput
                  value={profileSecretAnswer}
                  onChangeText={setProfileSecretAnswer}
                  placeholder="Type your answer here"
                  placeholderTextColor={theme.colors.textMuted}
                  style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                />

                {profile?.secretQuestion ? (
                  <>
                    <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Current Secret Answer (required to change)</Text>
                    <AppTextInput
                      value={currentSecretAnswer}
                      onChangeText={setCurrentSecretAnswer}
                      placeholder="Enter current secret answer"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                    />
                  </>
                ) : null}

                <Pressable
                  style={[styles.profileSaveButton, { backgroundColor: theme.colors.primary + '12', borderWidth: 1, borderColor: theme.colors.primary }]}
                  onPress={() => setShowChangePasswordModal(true)}
                >
                  <Ionicons name="lock-closed-outline" size={15} color={theme.colors.primary} />
                  <Text style={[styles.profileSaveButtonText, { color: theme.colors.primary }]}>Change Password</Text>
                </Pressable>

                <Pressable
                  style={[styles.profileSaveButton, { backgroundColor: savingProfile ? theme.colors.surfaceAlt : theme.colors.primary }]}
                  disabled={savingProfile}
                  onPress={saveProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color={theme.colors.primaryContrast} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={15} color={theme.colors.primaryContrast} />
                      <Text style={[styles.profileSaveButtonText, { color: theme.colors.primaryContrast }]}>Save Changes</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          {/* Wishlist — redesigned with clickable cards */}
          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              Wishlist {wishlist.length > 0 ? `(${wishlist.length})` : ''}
            </Text>
            {wishlist.length ? (
              <>
                <View style={styles.wishlistGrid}>
                  {paginatedWishlist.map((item) => (
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
                {totalWishlistPages > 1 ? (
                  <View style={styles.paginationRow}>
                    <Pressable
                      style={[styles.secondaryButtonMini, styles.paginationButtonMini, { borderColor: theme.colors.border, opacity: wishlistPage === 1 ? 0.45 : 1 }]}
                      onPress={() => setWishlistPage((prev) => Math.max(1, prev - 1))}
                      disabled={wishlistPage === 1}
                    >
                      <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Previous</Text>
                    </Pressable>
                    <Text style={[styles.paginationLabel, { color: theme.colors.textMuted }]}>
                      Page {wishlistPage} of {totalWishlistPages}
                    </Text>
                    <Pressable
                      style={[
                        styles.secondaryButtonMini,
                        styles.paginationButtonMini,
                        { borderColor: theme.colors.border, opacity: wishlistPage === totalWishlistPages ? 0.45 : 1 },
                      ]}
                      onPress={() => setWishlistPage((prev) => Math.min(totalWishlistPages, prev + 1))}
                      disabled={wishlistPage === totalWishlistPages}
                    >
                      <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Next</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>No saved items yet.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Delivery Locations</Text>
              <Pressable
                style={[styles.addIconBtn, { backgroundColor: theme.colors.primary + '15' }]}
                onPress={() => {
                  setAddressForm(DEFAULT_FORM);
                  setEditingAddressId(null);
                  setAddressFormExpanded(true);
                }}
              >
                <Ionicons name="add" size={18} color={theme.colors.primary} />
              </Pressable>
            </View>
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
                    onPress={() =>
                      showAlert({
                        title: 'Delete Address',
                        message: `Delete this delivery address? This cannot be undone.`,
                        tone: 'error',
                        actionLabel: 'Delete',
                        cancelLabel: 'Cancel',
                        onAction: async () => {
                          await deleteCustomerAddress(address.id);
                          if (editingAddressId === address.id) {
                            setEditingAddressId(null);
                            setAddressForm(DEFAULT_FORM);
                          }
                          await loadData();
                        },
                      })
                    }
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
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

          {/* Support */}
          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Support</Text>
            <Pressable
              style={[styles.supportChatBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => navigation.navigate('ChatSeller')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#FFFFFF" />
              <Text style={styles.supportChatBtnText}>Chat Seller</Text>
              {chatUnreadCount > 0 ? (
                <View style={[styles.supportButtonBadge, { backgroundColor: '#FFFFFF' }]}>
                  <Text style={[styles.supportButtonBadgeText, { color: theme.colors.primary }]}>
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              style={[styles.supportSecondaryBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
              onPress={() => navigation.navigate('Legal')}
            >
              <Text style={[styles.supportSecondaryBtnText, { color: theme.colors.text }]}>Security, Privacy & Terms</Text>
            </Pressable>
          </View>

          {/* Sign Out */}
          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Pressable style={[styles.signOutBtn, { backgroundColor: theme.colors.danger }]} onPress={() => signOut()}>
              <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.signOutBtnText, { color: '#FFFFFF' }]}>Sign Out</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Address Form Modal */}
      <Modal visible={addressFormExpanded} transparent animationType="slide" onRequestClose={() => { setAddressFormExpanded(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
                {editingAddressId ? 'Edit Delivery Address' : 'Add Delivery Address'}
              </Text>
              <Pressable onPress={() => { setAddressFormExpanded(false); }} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              <Text style={[styles.locationHint, { color: theme.colors.textMuted }]}>
                Move the pin or tap the map to set your exact delivery location.
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
              {Number.isFinite(addressForm.latitude) && Number.isFinite(addressForm.longitude) && (
                <View style={styles.pinMetaRow}>
                  <Text style={[styles.pinMeta, { color: theme.colors.textMuted }]}>
                    Pinned: {Number(addressForm.latitude).toFixed(5)}, {Number(addressForm.longitude).toFixed(5)}
                  </Text>
                  <Pressable
                    style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                    onPress={async () => {
                      if (!Number.isFinite(addressForm.latitude) || !Number.isFinite(addressForm.longitude)) return;
                      const reversed = await reverseGeocodePoint({
                        latitude: Number(addressForm.latitude),
                        longitude: Number(addressForm.longitude),
                      });
                      if (!reversed) return;
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
              )}
              {autoFillFromPinBusy ? (
                <Text style={[styles.locationHint, { color: theme.colors.textMuted }]}>Detecting address details...</Text>
              ) : null}

              <View style={styles.formRow}>
                <View style={styles.half}>
                  <Text style={[styles.label, { color: theme.colors.textMuted }]}>First Name *</Text>
                  <AppTextInput
                    value={addressForm.firstName}
                    onChangeText={(value) => setAddressForm((prev) => ({ ...prev, firstName: value }))}
                    placeholder="First name"
                    placeholderTextColor={theme.colors.textMuted}
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
                    autoComplete="family-name"
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                  />
                </View>
              </View>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Phone Number *</Text>
              <AppTextInput
                value={addressForm.phone}
                onChangeText={(value) => setAddressForm((prev) => ({ ...prev, phone: value.startsWith('+63') ? value : `+63${value.replace(/^[+]?63/, '')}` }))}
                placeholder="+63"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="phone-pad"
                autoComplete="tel"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
              <Text style={[styles.locationHint, { color: theme.colors.textMuted }]}>
                {loadingLocations ? 'Loading location options...' : isUsingFallback ? 'Using built-in location list.' : 'Select province, city, and barangay.'}
              </Text>

              <SearchableDropdown
                label="Province *"
                placeholder="Select province..."
                value={addressForm.province}
                options={provinceOptions}
                allowCustom
                onSelect={(value) => setAddressForm((prev) => ({ ...prev, province: value, city: '', barangay: '' }))}
              />
              <SearchableDropdown
                label="City *"
                placeholder="Select city..."
                value={addressForm.city}
                options={cityOptions}
                allowCustom
                onSelect={(value) => setAddressForm((prev) => ({ ...prev, city: value, barangay: '' }))}
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
                placeholder="e.g. 6000"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                autoComplete="postal-code"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Street / House No. / Building *</Text>
              <AppTextInput
                value={addressForm.line1}
                onChangeText={(value) => setAddressForm((prev) => ({ ...prev, line1: value }))}
                placeholder="e.g. 123 Rizal St., Blk 5 Lot 2"
                placeholderTextColor={theme.colors.textMuted}
                autoComplete="street-address"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Landmark (Optional)</Text>
              <AppTextInput
                value={addressForm.line2}
                onChangeText={(value) => setAddressForm((prev) => ({ ...prev, line2: value }))}
                placeholder="e.g. Near the church"
                placeholderTextColor={theme.colors.textMuted}
                autoComplete="address-line2"
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />

              <Pressable
                style={[styles.primaryButton, { backgroundColor: savingAddress ? theme.colors.surfaceAlt : theme.colors.primary, marginTop: 8 }]}
                onPress={saveAddress}
                disabled={savingAddress}
              >
                <Text style={[styles.primaryButtonText, { color: savingAddress ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
                  {savingAddress ? 'Saving...' : editingAddressId ? 'Update Address' : 'Save Address'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

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

      {/* Birthdate Picker Modal */}
      <Modal visible={showBdDatePicker} transparent animationType="fade" onRequestClose={() => setShowBdDatePicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowBdDatePicker(false)}>
          <Pressable style={[styles.modalContainer, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 16 }]} onPress={(e: any) => e.stopPropagation()}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Select Birthdate</Text>
              <Pressable onPress={() => setShowBdDatePicker(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Month</Text>
                <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                    <Pressable
                      key={m}
                      style={[styles.secretDropdownItem, { backgroundColor: bdPickerMonth === i ? theme.colors.primary + '15' : 'transparent', borderRadius: 6 }]}
                      onPress={() => setBdPickerMonth(i)}
                    >
                      <Text style={{ color: bdPickerMonth === i ? theme.colors.primary : theme.colors.text, fontSize: 13, fontWeight: bdPickerMonth === i ? '600' : '400' }}>{m.slice(0, 3)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Day</Text>
                <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <Pressable
                      key={d}
                      style={[styles.secretDropdownItem, { backgroundColor: bdPickerDay === d ? theme.colors.primary + '15' : 'transparent', borderRadius: 6 }]}
                      onPress={() => setBdPickerDay(d)}
                    >
                      <Text style={{ color: bdPickerDay === d ? theme.colors.primary : theme.colors.text, fontSize: 13, fontWeight: bdPickerDay === d ? '600' : '400' }}>{d}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Year</Text>
                <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <Pressable
                      key={y}
                      style={[styles.secretDropdownItem, { backgroundColor: bdPickerYear === y ? theme.colors.primary + '15' : 'transparent', borderRadius: 6 }]}
                      onPress={() => setBdPickerYear(y)}
                    >
                      <Text style={{ color: bdPickerYear === y ? theme.colors.primary : theme.colors.text, fontSize: 13, fontWeight: bdPickerYear === y ? '600' : '400' }}>{y}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
            <Pressable
              style={[styles.profileSaveButton, { backgroundColor: theme.colors.primary, marginHorizontal: 16, marginBottom: 8 }]}
              onPress={() => {
                const mm = String(bdPickerMonth + 1).padStart(2, '0');
                const dd = String(bdPickerDay).padStart(2, '0');
                setProfileBirthdate(`${bdPickerYear}-${mm}-${dd}`);
                setShowBdDatePicker(false);
              }}
            >
              <Text style={[styles.profileSaveButtonText, { color: '#FFFFFF' }]}>Confirm</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePasswordModal} transparent animationType="slide" onRequestClose={() => setShowChangePasswordModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Change Password</Text>
              <Pressable onPress={() => setShowChangePasswordModal(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Current Password *</Text>
              <View style={{ position: 'relative' }}>
                <AppTextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={8}
                  secureTextEntry={!showCurrentPassword}
                  style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface, paddingRight: 40 }]}
                />
                <Pressable style={{ position: 'absolute', right: 10, top: 10 }} onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                  <Ionicons name={showCurrentPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>

              <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>New Password (8 digits) *</Text>
              <View style={{ position: 'relative' }}>
                <AppTextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="8 digits only (e.g. 12345678)"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={8}
                  secureTextEntry={!showNewPassword}
                  style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface, paddingRight: 40 }]}
                />
                <Pressable style={{ position: 'absolute', right: 10, top: 10 }} onPress={() => setShowNewPassword(!showNewPassword)}>
                  <Ionicons name={showNewPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>

              <Text style={[styles.profileFieldLabel, { color: theme.colors.textMuted }]}>Confirm New Password *</Text>
              <View style={{ position: 'relative' }}>
                <AppTextInput
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  placeholder="Re-enter new password"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={8}
                  secureTextEntry={!showConfirmNewPassword}
                  style={[styles.profileInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface, paddingRight: 40 }]}
                />
                <Pressable style={{ position: 'absolute', right: 10, top: 10 }} onPress={() => setShowConfirmNewPassword(!showConfirmNewPassword)}>
                  <Ionicons name={showConfirmNewPassword ? 'eye-off' : 'eye'} size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>
              {newPassword.length > 0 && confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
                <Text style={{ color: '#E53935', fontSize: 11, fontWeight: '500' }}>Passwords do not match</Text>
              )}

              <Pressable
                style={[styles.profileSaveButton, { backgroundColor: changingPassword ? theme.colors.surfaceAlt : theme.colors.primary, marginTop: 8 }]}
                disabled={changingPassword}
                onPress={changePassword}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={15} color="#FFFFFF" />
                    <Text style={[styles.profileSaveButtonText, { color: '#FFFFFF' }]}>Update Password</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontWeight: '600',
  },
  addressFormHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    fontWeight: '600',
  },
  purchaseStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  purchaseStatusText: {
    fontSize: 11,
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
  supportChatBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  supportChatBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  supportSecondaryBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
  },
  supportSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  signOutBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  signOutBtnText: {
    fontSize: 15,
    fontWeight: '700',
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
  profileHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 8,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  avatarImage: {
    borderRadius: 999,
    height: 60,
    width: 60,
  },
  avatarEditBadge: {
    alignItems: 'center',
    borderRadius: 999,
    bottom: 0,
    elevation: 2,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    width: 22,
  },
  profileHeaderText: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '600',
  },
  profileUsername: {
    fontSize: 13,
    marginTop: 2,
  },
  restrictionBanner: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    padding: 10,
  },
  editProfileToggle: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editProfileToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  profileForm: {
    gap: 8,
    marginTop: 10,
  },
  profileSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 4,
  },
  profileSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  profileFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  profileInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  profileRow: {
    flexDirection: 'row',
    gap: 8,
  },
  profileHalfField: {
    flex: 1,
  },
  readOnlyField: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  readOnlyLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  readOnlyValue: {
    fontSize: 13,
  },
  secretDropdownContainer: {
    zIndex: 1,
  },
  secretDropdownTrigger: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  secretDropdownText: {
    flex: 1,
    fontSize: 13,
  },
  secretDropdownList: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  secretDropdownItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secretDropdownItemText: {
    flex: 1,
    fontSize: 12,
  },
  profileSaveButton: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginTop: 4,
    paddingVertical: 11,
  },
  profileSaveButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
