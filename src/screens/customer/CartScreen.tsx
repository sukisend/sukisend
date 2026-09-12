import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
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
import { fetchPublicProducts, fetchShippingMethods } from '../../services/productService';
import { fetchCustomerAddresses } from '../../services/addressService';
import { fetchDeliveryRatePerKmSetting, fetchFreeShippingThreshold } from '../../services/settingsService';
import { useCartStore } from '../../store/cartStore';
import { Product } from '../../types/models';
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
  const appliedCoupon = useCartStore((state) => state.appliedCoupon);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [estimatingFee, setEstimatingFee] = useState(false);
  const [shippingNote, setShippingNote] = useState('Shipping estimate based on your saved delivery location.');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(0);
  const initialLoadDone = useRef(false);
  const stepperPressRef = useRef(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (items.length === 0) {
      fetchPublicProducts({ sort: 'best_selling', pageSize: 10 })
        .then((rows) => setRecommendedProducts(rows.slice(0, 10)))
        .catch(() => setRecommendedProducts([]));
    }
  }, [items.length]);

  useEffect(() => {
    fetchFreeShippingThreshold()
      .then((threshold) => setFreeShippingThreshold(threshold > 0 ? threshold : 500))
      .catch(() => setFreeShippingThreshold(500));
  }, []);

  useEffect(() => {
    if (!initialLoadDone.current && items.length > 0) {
      initialLoadDone.current = true;
      setSelectedKeys(items.map((item) => getCartItemKey(item.product.id, item.variantId)));
    }
  }, [items]);

  useEffect(() => {
    const existing = new Set(items.map((item) => getCartItemKey(item.product.id, item.variantId)));
    setSelectedKeys((prev) => prev.filter((key) => existing.has(key)));
  }, [items]);

  useEffect(() => {
    setQtyInputs((prev) => {
      const next: Record<string, string> = {};
      for (const item of items) {
        const key = getCartItemKey(item.product.id, item.variantId);
        next[key] = prev[key] !== undefined ? prev[key] : String(item.quantity);
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
  const discount = appliedCoupon?.discountAmount ?? 0;
  const freeShippingUnlocked = freeShippingThreshold > 0 && selectedSubtotal >= freeShippingThreshold;
  const effectiveDeliveryFee = freeShippingUnlocked ? 0 : deliveryFee;
  const total = Math.max(0, selectedSubtotal - discount + (selectedItems.length ? effectiveDeliveryFee : 0));

  const allItemsSubtotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.unitPrice ?? getProductBasePrice(item.product)) * item.quantity, 0),
    [items],
  );
  const allFreeShippingUnlocked = freeShippingThreshold > 0 && allItemsSubtotal >= freeShippingThreshold;

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
        if (cancelled) return;
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
              buildAddressQuery([address.line1, address.line2, address.barangay, address.city, address.province, address.postalCode, address.countryRegion]),
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
          route ? `Route distance ${km.toFixed(2)} km - Rate ${formatPHP(ratePerKm)}/km` : 'Route lookup unavailable, showing courier base fee.',
        );
      } catch {
        if (!cancelled) {
          setDeliveryFee(35);
          setDistanceKm(null);
          setShippingNote('Shipping estimate unavailable right now, showing fallback fee.');
        }
      } finally {
        if (!cancelled) setEstimatingFee(false);
      }
    };
    estimateShippingFee();
    return () => { cancelled = true; };
  }, [profile?.id, role, selectedItems]);

  useEffect(() => {
    if (freeShippingThreshold <= 0) return;
    const targetPercent = Math.min(100, (allItemsSubtotal / freeShippingThreshold) * 100);
    Animated.spring(progressAnim, {
      toValue: targetPercent,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();
  }, [allItemsSubtotal, freeShippingThreshold]);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const toggleSelectAll = () => {
    const allKeys = items.map((item) => getCartItemKey(item.product.id, item.variantId));
    const allSelected = allKeys.every((k) => selectedKeys.includes(k));
    setSelectedKeys(allSelected ? [] : allKeys);
  };

  const handleQtyChange = (key: string, productId: string, variantId: string | undefined, newQty: number) => {
    stepperPressRef.current = true;
    const normalized = Math.max(1, newQty);
    setQuantity(productId, normalized, variantId);
    setQtyInputs((prev) => ({ ...prev, [key]: String(normalized) }));
  };

  const handleInputBlur = (key: string, productId: string, variantId: string | undefined) => {
    if (stepperPressRef.current) {
      stepperPressRef.current = false;
      return;
    }
    const raw = qtyInputs[key] ?? '';
    const parsed = Number(raw.trim());
    const normalized = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
    setQuantity(productId, normalized, variantId);
    setQtyInputs((prev) => ({ ...prev, [key]: String(normalized) }));
  };

  const allSelected = items.length > 0 && items.every((item) => selectedKeys.includes(getCartItemKey(item.product.id, item.variantId)));

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 140, paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={[styles.title, { color: theme.colors.text }]}>My Cart</Text>

        {!items.length ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cart-outline" size={64} color={theme.colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>Your cart is empty</Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textMuted }]}>Browse products and add items to your cart.</Text>
            <Pressable
              style={[styles.goShoppingBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => navigation.navigate('CustomerTabs', { screen: 'Shop' })}
            >
              <Ionicons name="storefront-outline" size={18} color="#fff" />
              <Text style={styles.goShoppingText}>Go Shopping!</Text>
            </Pressable>

            {/* You May Also Like */}
            {recommendedProducts.length > 0 ? (
              <View style={styles.recommendedSection}>
                <Text style={[styles.recommendedTitle, { color: theme.colors.text }]}>You May Also Like</Text>
                <FlatList
                  data={recommendedProducts}
                  keyExtractor={(item) => item.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={130}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  contentContainerStyle={styles.recommendedList}
                  renderItem={({ item: product }) => (
                    <Pressable
                      style={[styles.recommendedCard, { backgroundColor: theme.colors.card }]}
                      onPress={() => navigation.navigate('ProductDetail', { product })}
                    >
                      {product.imageUrl ? (
                        <Image source={{ uri: product.imageUrl }} style={styles.recommendedImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.recommendedImg, { backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="bag-handle-outline" size={20} color={theme.colors.textMuted} />
                        </View>
                      )}
                      <Text style={[styles.recommendedName, { color: theme.colors.text }]} numberOfLines={2}>
                        {product.name}
                      </Text>
                      <Text style={[styles.recommendedPrice, { color: theme.colors.primary }]}>
                        {formatPHP(getProductBasePrice(product))}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <>
            {/* Select All */}
            <Pressable style={[styles.selectAllBar, { backgroundColor: theme.colors.card }]} onPress={toggleSelectAll}>
              <Ionicons
                name={allSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={allSelected ? theme.colors.primary : theme.colors.textMuted}
              />
              <Text style={[styles.selectAllText, { color: theme.colors.text }]}>Select all</Text>
              <Text style={[styles.selectedCount, { color: theme.colors.textMuted }]}>{selectedItems.length}/{items.length}</Text>
            </Pressable>

            {/* Cart Items */}
            <View style={styles.itemList}>
              {items.map((item) => {
                const itemKey = getCartItemKey(item.product.id, item.variantId);
                const selected = selectedKeys.includes(itemKey);
                const unitPrice = item.unitPrice ?? getProductBasePrice(item.product);
                const lineTotal = unitPrice * item.quantity;

                return (
                  <View key={itemKey} style={[styles.itemCard, { backgroundColor: theme.colors.card }]}>
                    <View style={styles.cardRow}>
                      <Pressable onPress={() => toggleSelect(itemKey)} hitSlop={4}>
                        <Ionicons
                          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={18}
                          color={selected ? theme.colors.primary : theme.colors.textMuted}
                        />
                      </Pressable>

                      <Pressable
                        style={styles.itemTouch}
                        onPress={() => navigation.navigate('ProductDetail', { product: item.product })}
                      >
                        {item.product.imageUrl ? (
                          <Image source={{ uri: item.product.imageUrl }} style={styles.thumb} />
                        ) : (
                          <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="bag-handle-outline" size={18} color={theme.colors.textMuted} />
                          </View>
                        )}

                        <View style={styles.itemInfo}>
                          <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>{item.product.name}</Text>
                          <Text style={[styles.itemMeta, { color: theme.colors.textMuted }]}>
                            {item.product.unit}{item.variantLabel ? ` · ${item.variantLabel}` : ''}
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          showAlert({
                            title: 'Remove Item',
                            message: `Remove "${item.product.name}" from your cart?`,
                            tone: 'error',
                            actionLabel: 'Remove',
                            cancelLabel: 'Cancel',
                            onAction: () => removeItem(item.product.id, item.variantId),
                          })
                        }
                        hitSlop={4}
                      >
                        <Ionicons name="trash-outline" size={14} color={theme.colors.textMuted} />
                      </Pressable>
                    </View>

                    {/* Price + Stepper row */}
                    <View style={styles.priceRow}>
                      <Text style={[styles.lineTotal, { color: theme.colors.primary }]}>{formatPHP(lineTotal)}</Text>
                      <View style={[styles.stepper, { backgroundColor: theme.colors.surfaceAlt }]}>
                        <Pressable
                          style={styles.stepperBtn}
                          onPress={() => handleQtyChange(itemKey, item.product.id, item.variantId, item.quantity - 1)}
                        >
                          <Ionicons name="remove" size={13} color={theme.colors.text} />
                        </Pressable>
                        <TextInput
                          style={[styles.stepperInput, { color: theme.colors.text }]}
                          value={qtyInputs[itemKey] ?? String(item.quantity)}
                          onChangeText={(v) => setQtyInputs((prev) => ({ ...prev, [itemKey]: v.replace(/[^0-9]/g, '') }))}
                          onBlur={() => handleInputBlur(itemKey, item.product.id, item.variantId)}
                          keyboardType="number-pad"
                          returnKeyType="done"
                          maxLength={4}
                          selectTextOnFocus
                        />
                        <Pressable
                          style={styles.stepperBtn}
                          onPress={() => handleQtyChange(itemKey, item.product.id, item.variantId, item.quantity + 1)}
                        >
                          <Ionicons name="add" size={13} color={theme.colors.text} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Free Shipping Progress */}
            {freeShippingThreshold > 0 && items.length > 0 ? (
              <View style={[styles.freeShippingCard, { backgroundColor: allFreeShippingUnlocked ? theme.colors.success + '10' : theme.colors.card }]}>
                {allFreeShippingUnlocked ? (
                  <View style={styles.freeShippingRow}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                    <Text style={[styles.freeShippingText, { color: theme.colors.success }]}>Free delivery unlocked!</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.freeShippingRow}>
                      <Ionicons name="car-outline" size={14} color={theme.colors.primary} />
                      <Text style={[styles.freeShippingText, { color: theme.colors.text }]}>
                        Add {formatPHP(freeShippingThreshold - allItemsSubtotal)} more for free delivery
                      </Text>
                    </View>
                    <View style={[styles.progressBarTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Animated.View
                        style={[
                          styles.progressBarFill,
                          {
                            backgroundColor: theme.colors.primary,
                            width: progressAnim.interpolate({
                              inputRange: [0, 100],
                              outputRange: ['0%', '100%'],
                              extrapolate: 'clamp',
                            }),
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.freeShippingGoal, { color: theme.colors.textMuted }]}>
                      {formatPHP(allItemsSubtotal)} / {formatPHP(freeShippingThreshold)}
                    </Text>
                  </>
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Bottom Bar */}
      {items.length > 0 ? (
        <View style={[styles.bottomBar, { backgroundColor: theme.colors.card, paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.bottomSummary}>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.colors.textMuted }]}>Subtotal</Text>
              <Text style={[styles.breakdownValue, { color: theme.colors.text }]}>{formatPHP(selectedSubtotal)}</Text>
            </View>
            {effectiveDeliveryFee > 0 ? (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: theme.colors.textMuted }]}>Delivery</Text>
                <Text style={[styles.breakdownValue, { color: theme.colors.text }]}>{formatPHP(effectiveDeliveryFee)}</Text>
              </View>
            ) : null}
            {discount > 0 ? (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: theme.colors.success }]}>Discount</Text>
                <Text style={[styles.breakdownValue, { color: theme.colors.success }]}>- {formatPHP(discount)}</Text>
              </View>
            ) : null}
            <View style={[styles.breakdownRow, styles.totalRow, { borderTopColor: theme.colors.border }]}>
              <Text style={[styles.totalLabel, { color: theme.colors.text }]}>Total</Text>
              <Text style={[styles.totalPrice, { color: theme.colors.primary }]}>{formatPHP(total)}</Text>
            </View>
          </View>
          <Pressable
            style={[
              styles.checkoutBtn,
              { backgroundColor: selectedItems.length ? theme.colors.primary : theme.colors.surfaceAlt },
            ]}
            disabled={!selectedItems.length}
            onPress={() => {
              if (!selectedItems.length) {
                showAlert({ title: 'No items selected', message: 'Select at least one cart item before checkout.', tone: 'info' });
                return;
              }
              navigation.navigate('Checkout', { selectedKeys, freeShippingUnlocked });
            }}
          >
            <Ionicons name="arrow-forward" size={16} color={selectedItems.length ? '#fff' : theme.colors.textMuted} />
            <Text style={[styles.checkoutText, { color: selectedItems.length ? '#fff' : theme.colors.textMuted }]}>Checkout</Text>
          </Pressable>
        </View>
      ) : null}

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16 },

  /* Header */
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12 },

  /* Select All */
  selectAllBar: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  selectAllText: { flex: 1, fontSize: 13, fontWeight: '600' },
  selectedCount: { fontSize: 12, fontWeight: '600' },

  /* Items */
  itemList: { gap: 10 },
  itemCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  thumb: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 56,
    width: 56,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  itemMeta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    opacity: 0.6,
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lineTotal: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  stepper: {
    alignItems: 'center',
    borderRadius: 20,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  stepperBtn: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  stepperInput: {
    fontSize: 13,
    fontWeight: '700',
    height: 30,
    minWidth: 34,
    paddingHorizontal: 2,
    textAlign: 'center',
    width: 34,
  },

  /* Empty State */
  emptyWrap: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  goShoppingBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  goShoppingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Recommended */
  recommendedSection: {
    marginTop: 30,
    width: '100%',
  },
  recommendedTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  recommendedList: {
    gap: 10,
    paddingRight: 14,
  },
  recommendedCard: {
    borderRadius: 10,
    overflow: 'hidden',
    width: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  recommendedImg: {
    height: 100,
    width: '100%',
  },
  recommendedName: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  recommendedPrice: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 3,
  },

  /* Free Shipping */
  freeShippingCard: {
    borderRadius: 12,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  freeShippingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  freeShippingText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarTrack: {
    borderRadius: 999,
    height: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    borderRadius: 999,
    height: '100%',
  },
  freeShippingGoal: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },

  /* Bottom Bar */
  bottomBar: {
    alignItems: 'center',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 12,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomSummary: { flex: 1 },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  breakdownLabel: { fontSize: 11, fontWeight: '500' },
  breakdownValue: { fontSize: 11, fontWeight: '600' },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    paddingTop: 4,
    marginBottom: 0,
  },
  totalLabel: { fontSize: 13, fontWeight: '700' },
  totalPrice: { fontSize: 16, fontWeight: '800' },
  checkoutBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  checkoutText: { fontSize: 14, fontWeight: '700' },
});
