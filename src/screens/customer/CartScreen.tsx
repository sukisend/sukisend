import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { EmptyState } from '../../components/EmptyState';
import { LogoHeader } from '../../components/LogoHeader';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import {
  buildAddressQuery,
  computeDeliveryFeeByDistance,
  fetchDrivingRoute,
  geocodeAddress,
  getStoreCoordinates,
} from '../../services/geocodingService';
import { fetchCustomerAddresses, fetchShippingMethods } from '../../services/productService';
import { fetchDeliveryRatePerKmSetting } from '../../services/settingsService';
import { useCartStore } from '../../store/cartStore';
import { formatPHP } from '../../utils/currency';
import { getProductBasePrice } from '../../utils/pricing';

function getCartItemKey(productId: string, variantId?: string) {
  return `${productId}::${variantId ?? 'default'}`;
}

export function CartScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { role, profile } = useAuth();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const items = useCartStore((state) => state.items);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [estimatingFee, setEstimatingFee] = useState(false);
  const [shippingNote, setShippingNote] = useState('Shipping estimate based on your saved delivery location.');

  useEffect(() => {
    const existing = new Set(items.map((item) => getCartItemKey(item.product.id, item.variantId)));
    setSelectedKeys((prev) => {
      const retained = prev.filter((key) => existing.has(key));
      if (retained.length) {
        return retained;
      }
      return items.map((item) => getCartItemKey(item.product.id, item.variantId));
    });
  }, [items]);

  useEffect(() => {
    setQtyInputs((prev) => {
      const next: Record<string, string> = {};
      for (const item of items) {
        const key = getCartItemKey(item.product.id, item.variantId);
        next[key] = prev[key] ?? String(item.quantity);
      }
      return next;
    });
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedKeys.includes(getCartItemKey(item.product.id, item.variantId))),
    [items, selectedKeys],
  );
  const selectedSubtotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + (item.unitPrice ?? getProductBasePrice(item.product)) * item.quantity, 0),
    [selectedItems],
  );
  const total = selectedSubtotal + (selectedItems.length ? deliveryFee : 0);

  useEffect(() => {
    let cancelled = false;

    const estimateShippingFee = async () => {
      if (!selectedItems.length) {
        setDeliveryFee(0);
        setDistanceKm(null);
        setShippingNote('Select cart items to see your delivery estimate.');
        return;
      }

      if (role !== 'customer' || !profile?.id) {
        setDeliveryFee(0);
        setDistanceKm(null);
        setShippingNote('Sign in and save a delivery address to estimate shipping.');
        return;
      }

      setEstimatingFee(true);
      try {
        const [addresses, methods, ratePerKm] = await Promise.all([
          fetchCustomerAddresses(profile.id),
          fetchShippingMethods(),
          fetchDeliveryRatePerKmSetting(),
        ]);

        if (cancelled) {
          return;
        }

        const address = addresses.find((item) => item.isDefault) ?? addresses[0];
        if (!address) {
          setDeliveryFee(0);
          setDistanceKm(null);
          setShippingNote('Add a delivery address to calculate shipping fee.');
          return;
        }

        const sukiMethod =
          methods.find((method) => method.name.toLowerCase().includes('suki send')) ??
          methods.sort((a, b) => a.baseFee - b.baseFee)[0] ??
          null;

        const fallbackBaseFee = sukiMethod?.baseFee ?? 35;
        const hasPin = Number.isFinite(address.latitude) && Number.isFinite(address.longitude);
        const destination = hasPin
          ? { latitude: Number(address.latitude), longitude: Number(address.longitude) }
          : await geocodeAddress(
              buildAddressQuery([
                address.line1,
                address.line2,
                address.barangay,
                address.city,
                address.province,
                address.postalCode,
                address.countryRegion,
              ]),
            );

        if (!destination) {
          setDeliveryFee(fallbackBaseFee);
          setDistanceKm(null);
          setShippingNote('Distance lookup unavailable, showing courier base fee.');
          return;
        }

        const store = getStoreCoordinates();
        const route = await fetchDrivingRoute(store, destination);
        const km = route?.distanceKm ?? 0;
        const calibratedFee = computeDeliveryFeeByDistance(km, ratePerKm);
        setDistanceKm(route ? Number(km.toFixed(2)) : null);
        setDeliveryFee(calibratedFee > 0 ? calibratedFee : fallbackBaseFee);
        setShippingNote(
          route
            ? `Route distance ${km.toFixed(2)} km - Rate ${formatPHP(ratePerKm)}/km`
            : 'Route lookup unavailable, showing courier base fee.',
        );
      } catch {
        if (!cancelled) {
          setDeliveryFee(35);
          setDistanceKm(null);
          setShippingNote('Shipping estimate unavailable right now, showing fallback fee.');
        }
      } finally {
        if (!cancelled) {
          setEstimatingFee(false);
        }
      }
    };

    estimateShippingFee();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, role, selectedItems]);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const applyTypedQuantity = (key: string, productId: string, variantId: string | undefined) => {
    const raw = qtyInputs[key] ?? '';
    const parsed = Number(raw.trim());
    const normalized = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
    setQuantity(productId, normalized, variantId);
    setQtyInputs((prev) => ({ ...prev, [key]: String(normalized) }));
  };

  const cartPalette = theme.isDark
    ? ['#10243F', '#17333E', '#4A2A10', '#3B2030']
    : ['#EAF3FF', '#EAFBF1', '#FFF3E6', '#FDEFF5'];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 8), paddingTop: insets.top + 10 }]}
    >
      <LogoHeader />
      <Text style={[styles.title, { color: theme.colors.text }]}>My Cart</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
        Select products you want to check out now.
      </Text>

      {!items.length ? (
        <EmptyState title="Your cart is empty" subtitle="Add products first before checkout." />
      ) : (
        <View style={styles.list}>
          <View style={styles.selectionActions}>
            <Pressable
              style={[styles.selectionBtn, { borderColor: theme.colors.border }]}
              onPress={() => setSelectedKeys(items.map((item) => getCartItemKey(item.product.id, item.variantId)))}
            >
              <Text style={[styles.selectionBtnText, { color: theme.colors.text }]}>Select all</Text>
            </Pressable>
            <Pressable
              style={[styles.selectionBtn, { borderColor: theme.colors.border }]}
              onPress={() => setSelectedKeys([])}
            >
              <Text style={[styles.selectionBtnText, { color: theme.colors.text }]}>Clear selection</Text>
            </Pressable>
          </View>

          {items.map((item, index) => {
            const itemKey = getCartItemKey(item.product.id, item.variantId);
            const selected = selectedKeys.includes(itemKey);
            const toneColor = cartPalette[index % cartPalette.length];

            return (
              <View
                key={itemKey}
                style={[
                  styles.card,
                  {
                    backgroundColor: toneColor,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <Pressable style={styles.selectWrap} onPress={() => toggleSelect(itemKey)}>
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={selected ? theme.colors.primary : theme.colors.textMuted}
                    />
                  </Pressable>
                  {item.product.imageUrl ? (
                    <Image source={{ uri: item.product.imageUrl }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumbFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Ionicons name="bag-handle-outline" size={18} color={theme.colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={2}>
                      {item.product.name}
                    </Text>
                    <Text style={[styles.itemMeta, { color: theme.colors.textMuted }]}>
                      {item.product.unit}
                      {item.variantLabel ? ` - ${item.variantLabel}` : ''} - {formatPHP(item.unitPrice ?? getProductBasePrice(item.product))}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeItem(item.product.id, item.variantId)}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                  </Pressable>
                </View>

                <View style={styles.qtyRow}>
                  <Pressable
                    style={[styles.qtyButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => setQuantity(item.product.id, item.quantity - 1, item.variantId)}
                  >
                    <Text style={[styles.qtyButtonText, { color: theme.colors.text }]}>-</Text>
                  </Pressable>
                  <TextInput
                    value={qtyInputs[itemKey] ?? String(item.quantity)}
                    onChangeText={(value) => setQtyInputs((prev) => ({ ...prev, [itemKey]: value.replace(/[^0-9]/g, '') }))}
                    onBlur={() => applyTypedQuantity(itemKey, item.product.id, item.variantId)}
                    onSubmitEditing={() => applyTypedQuantity(itemKey, item.product.id, item.variantId)}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={4}
                    style={[styles.qtyInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                  />
                  <Pressable
                    style={[styles.qtyButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => setQuantity(item.product.id, item.quantity + 1, item.variantId)}
                  >
                    <Text style={[styles.qtyButtonText, { color: theme.colors.text }]}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View
        style={[
          styles.summaryCard,
          {
            backgroundColor: theme.isDark ? '#142C4E' : '#EDF3FF',
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Selected items</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
            {selectedItems.length} / {items.length}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Subtotal</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatPHP(selectedSubtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Delivery Fee</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
            {estimatingFee ? 'Estimating...' : formatPHP(selectedItems.length ? deliveryFee : 0)}
          </Text>
        </View>
        <Text style={[styles.shippingNote, { color: theme.colors.textMuted }]}>
          {shippingNote}
          {distanceKm !== null ? ` (Approx ${distanceKm.toFixed(2)} km)` : ''}
        </Text>
        <View style={[styles.summaryRow, styles.summaryTotal]}>
          <Text style={[styles.summaryLabel, { color: theme.colors.text }]}>Total</Text>
          <Text style={[styles.summaryTotalValue, { color: theme.colors.primary }]}>{formatPHP(total)}</Text>
        </View>
      </View>

      <Pressable
        disabled={!selectedItems.length}
        style={[
          styles.primaryButton,
          {
            backgroundColor: selectedItems.length ? theme.colors.primary : theme.colors.surfaceAlt,
          },
        ]}
        onPress={() => {
          if (!selectedItems.length) {
            showAlert({
              title: 'No products selected',
              message: 'Select at least one cart item before checkout.',
              tone: 'info',
            });
            return;
          }

          navigation.navigate('Checkout', { selectedKeys });
        }}
      >
        <Text
          style={[
            styles.primaryButtonText,
            { color: selectedItems.length ? theme.colors.primaryContrast : theme.colors.textMuted },
          ]}
        >
          Proceed to Checkout
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
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  list: {
    gap: 10,
    marginTop: 12,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  selectionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  selectWrap: {
    paddingVertical: 4,
  },
  thumb: {
    borderRadius: 8,
    height: 52,
    width: 52,
  },
  thumbFallback: {
    alignItems: 'center',
    borderRadius: 8,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  cardInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  qtyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingLeft: 30,
  },
  qtyButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  qtyButtonText: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  qtyInput: {
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '700',
    minWidth: 50,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 14,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  shippingNote: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: -2,
  },
  summaryTotal: {
    marginTop: 6,
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  primaryButton: {
    borderRadius: 999,
    marginTop: 14,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
