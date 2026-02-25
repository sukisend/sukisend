import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PH_LOCATION_MAP } from '../../data/locationData';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  deleteCustomerAddress,
  fetchCustomerAddresses,
  fetchCustomerOrders,
  fetchWishlist,
  saveCustomerAddress,
  setDefaultAddress,
  toggleWishlist,
} from '../../services/productService';
import { CustomerAddress, Order, WishlistItem } from '../../types/models';

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
};

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme, mode, toggleTheme } = useTheme();
  const { role, profile, signOut } = useAuth();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [addressForm, setAddressForm] = useState(DEFAULT_FORM);
  const [savingAddress, setSavingAddress] = useState(false);

  const selectedProvince = useMemo(
    () => PH_LOCATION_MAP.find((entry) => entry.province === addressForm.province),
    [addressForm.province],
  );
  const cityOptions = selectedProvince?.cities ?? [];
  const selectedCity = cityOptions.find((entry) => entry.city === addressForm.city);
  const barangayOptions = selectedCity?.barangays ?? [];

  const loadData = useCallback(async () => {
    if (!profile?.id || role !== 'customer') {
      setAddresses([]);
      setWishlist([]);
      setRecentOrders([]);
      return;
    }

    try {
      const [nextAddresses, nextWishlist, nextOrders] = await Promise.all([
        fetchCustomerAddresses(profile.id),
        fetchWishlist(profile.id),
        fetchCustomerOrders(profile.id),
      ]);

      setAddresses(nextAddresses);
      setWishlist(nextWishlist);
      setRecentOrders(nextOrders.slice(0, 6));
    } catch {
      setAddresses([]);
      setWishlist([]);
      setRecentOrders([]);
    }
  }, [profile?.id, role]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

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
      await saveCustomerAddress({
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
        isDefault: addresses.length === 0,
      });
      setAddressForm(DEFAULT_FORM);
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
        paddingBottom: tabBarHeight + 18,
      }}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>Account</Text>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Appearance</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>Dark Mode</Text>
          <Switch value={mode === 'dark'} onValueChange={toggleTheme} />
        </View>
      </View>

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
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Profile</Text>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Name: {profile?.fullName}</Text>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Email: {profile?.email}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Wishlist</Text>
            {wishlist.length ? (
              wishlist.map((item) => (
                <View key={item.id} style={styles.inlineRow}>
                  <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.product?.name ?? 'Product'}
                  </Text>
                  <Pressable
                    style={[styles.secondaryButtonMini, { borderColor: theme.colors.border }]}
                    onPress={async () => {
                      if (!profile?.id) {
                        return;
                      }
                      await toggleWishlist(profile.id, item.productId);
                      await loadData();
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Remove</Text>
                  </Pressable>
                </View>
              ))
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
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Add New Delivery Address</Text>
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

            <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>Province</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
              {PH_LOCATION_MAP.map((entry) => {
                const active = entry.province === addressForm.province;
                return (
                  <Pressable
                    key={entry.province}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                      },
                    ]}
                    onPress={() =>
                      setAddressForm((prev) => ({
                        ...prev,
                        province: entry.province,
                        city: '',
                        barangay: '',
                      }))
                    }
                  >
                    <Text style={[styles.chipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                      {entry.province}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {cityOptions.length ? (
              <>
                <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>City</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
                  {cityOptions.map((entry) => {
                    const active = entry.city === addressForm.city;
                    return (
                      <Pressable
                        key={entry.city}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                          },
                        ]}
                        onPress={() =>
                          setAddressForm((prev) => ({
                            ...prev,
                            city: entry.city,
                            barangay: '',
                          }))
                        }
                      >
                        <Text style={[styles.chipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                          {entry.city}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            {barangayOptions.length ? (
              <>
                <Text style={[styles.inputLabel, { color: theme.colors.textMuted }]}>Barangay</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
                  {barangayOptions.map((entry) => {
                    const active = entry === addressForm.barangay;
                    return (
                      <Pressable
                        key={entry}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                          },
                        ]}
                        onPress={() => setAddressForm((prev) => ({ ...prev, barangay: entry }))}
                      >
                        <Text style={[styles.chipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                          {entry}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

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
                {savingAddress ? 'Saving...' : 'Save Address'}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Recent Purchases</Text>
            {recentOrders.length ? (
              recentOrders.map((order) => (
                <Text key={order.id} style={[styles.label, { color: theme.colors.textMuted }]}>
                  {order.orderNo} - {order.status} - {order.total.toFixed(2)}
                </Text>
              ))
            ) : (
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>No order history yet.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.danger }]} onPress={() => signOut()}>
              <Text style={[styles.primaryButtonText, { color: '#FFFFFF' }]}>Sign Out</Text>
            </Pressable>
          </View>
        </>
      )}

      <Pressable style={styles.hiddenAccess} onLongPress={() => navigation.navigate('Auth', { mode: 'admin', intent: 'account' })}>
        <Text style={[styles.hiddenAccessText, { color: theme.colors.textMuted }]}>SUKI SEND v1.0.0</Text>
      </Pressable>
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
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  inlineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
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
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  chipList: {
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
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
