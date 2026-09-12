import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { AppTextInput } from '../../components/AppTextInput';
import { EmptyState } from '../../components/EmptyState';
import { FilterModal } from '../../components/FilterModal';
import { GreetingBubble } from '../../components/GreetingBubble';
import { LogoHeader } from '../../components/LogoHeader';
import { ProductCard } from '../../components/ProductCard';
import { VariantPickerModal } from '../../components/VariantPickerModal';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchActiveBanners, Banner } from '../../services/adminService';
import { fetchCustomerUnreadSellerMessagesCount } from '../../services/chatModerationService';
import { fetchPublicCategories, fetchPublicProducts } from '../../services/productService';
import { fetchWishlist, toggleWishlist } from '../../services/wishlistService';
import { useCartStore } from '../../store/cartStore';
import { Category, Product, ProductSortOption } from '../../types/models';
import { getCategoryIcon } from '../../utils/categoryIcons';
import { getProductBasePrice } from '../../utils/pricing';
import { getCachedProducts, setCachedProducts } from '../../utils/productCache';

const PAGE_SIZE = 12;
const BANNER_INTERVAL = 4000;
const TYPING_SPEED = 80;
const TYPING_DELETE_SPEED = 40;
const TYPING_PAUSE = 1800;
const BOTTOM_TAB_HEIGHT = 58;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_GAP = 8;
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 32 - CARD_GAP * 2) / 3);

function useTypingPlaceholder(products: Product[], enabled: boolean) {
  const [display, setDisplay] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef(0);
  const charRef = useRef(0);
  const phaseRef = useRef<'type' | 'pause' | 'delete'>('type');

  useEffect(() => {
    if (!enabled || products.length === 0) {
      setDisplay('');
      return;
    }

    const names = products.map((p) => p.name);
    let mounted = true;

    const tick = () => {
      if (!mounted) return;
      const name = names[idxRef.current % names.length];

      if (phaseRef.current === 'type') {
        charRef.current++;
        setDisplay(name.slice(0, charRef.current));
        if (charRef.current >= name.length) {
          phaseRef.current = 'pause';
          timerRef.current = setTimeout(tick, TYPING_PAUSE);
          return;
        }
        timerRef.current = setTimeout(tick, TYPING_SPEED);
      } else if (phaseRef.current === 'pause') {
        phaseRef.current = 'delete';
        timerRef.current = setTimeout(tick, TYPING_DELETE_SPEED);
      } else {
        charRef.current--;
        setDisplay(name.slice(0, charRef.current));
        if (charRef.current <= 0) {
          phaseRef.current = 'type';
          idxRef.current++;
          timerRef.current = setTimeout(tick, 300);
          return;
        }
        timerRef.current = setTimeout(tick, TYPING_DELETE_SPEED);
      }
    };

    timerRef.current = setTimeout(tick, 400);

    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [products, enabled]);

  return display;
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const addItem = useCartStore((state) => state.addItem);
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();

  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ProductSortOption>('all');
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [filterVisible, setFilterVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const loadingMoreRef = useRef(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [bannerFullscreen, setBannerFullscreen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const [variantPickerVisible, setVariantPickerVisible] = useState(false);

  const typingPlaceholder = useTypingPlaceholder(products, !searchFocused && search.length === 0);

  useEffect(() => {
    fetchPublicCategories()
      .then((rows) => setCategories(rows))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (role !== 'customer' || !profile?.id) {
      setChatUnreadCount(0);
      return;
    }
    let active = true;
    const sync = async () => {
      try {
        const next = await fetchCustomerUnreadSellerMessagesCount(profile.id);
        if (active) setChatUnreadCount(next);
      } catch {
        if (active) setChatUnreadCount(0);
      }
    };
    sync();
    const timer = setInterval(sync, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [profile?.id, role]);

  useEffect(() => {
    fetchActiveBanners()
      .then((rows) => {
        setBanners(rows);
        setActiveBannerIndex(0);
      })
      .catch(() => setBanners([]));
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    bannerTimerRef.current = setInterval(() => {
      setActiveBannerIndex((prev) => (prev + 1) % banners.length);
    }, BANNER_INTERVAL);
    return () => {
      if (bannerTimerRef.current) clearInterval(bannerTimerRef.current);
    };
  }, [banners.length]);

  useEffect(() => {
    setPage(1);
    setProducts([]);
    setHasNextPage(true);
  }, [selectedCategory, search, sortBy]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      if (page === 1) {
        setLoading(true);
      }
      loadingMoreRef.current = true;

      try {
        const baseQuery = {
          search,
          categoryId: selectedCategory,
          sort: sortBy,
        };

        const cached = getCachedProducts(search, selectedCategory, sortBy, page, PAGE_SIZE);
        if (cached) {
          if (!cancelled) {
            if (page === 1) {
              setProducts(cached);
            } else {
              setProducts((prev) => [...prev, ...cached]);
            }
            setHasNextPage(cached.length === PAGE_SIZE);
            setLoading(false);
            loadingMoreRef.current = false;
          }
          return;
        }

        const nextProducts = await fetchPublicProducts({
          ...baseQuery,
          page,
          pageSize: PAGE_SIZE,
        });

        if (cancelled) return;

        setCachedProducts(search, selectedCategory, sortBy, page, PAGE_SIZE, nextProducts);

        if (page === 1) {
          setProducts(nextProducts);
        } else {
          setProducts((prev) => [...prev, ...nextProducts]);
        }
        setHasNextPage(nextProducts.length === PAGE_SIZE);
      } catch {
        if (!cancelled) {
          if (page === 1) {
            setProducts([]);
          }
          setHasNextPage(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          loadingMoreRef.current = false;
        }
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [page, search, selectedCategory, sortBy]);

  useEffect(() => {
    if (role !== 'customer' || !profile?.id) {
      setWishlistIds([]);
      return;
    }

    fetchWishlist(profile.id)
      .then((rows) => setWishlistIds(rows.map((item) => item.productId)))
      .catch(() => setWishlistIds([]));
  }, [role, profile?.id]);

  const onToggleWishlist = async (productId: string) => {
    if (role !== 'customer' || !profile?.id) {
      navigation.navigate('Auth', { mode: 'signin', intent: 'account' });
      return;
    }

    try {
      const liked = await toggleWishlist(profile.id, productId);
      setWishlistIds((prev) =>
        liked ? Array.from(new Set([...prev, productId])) : prev.filter((id) => id !== productId),
      );
    } catch {
      // Ignore toggle failure in browse flow.
    }
  };

  const handleAddToCart = (product: Product) => {
    if (product.variants && product.variants.length > 0) {
      setVariantPickerProduct(product);
      setVariantPickerVisible(true);
      return;
    }
    addItem(product, 1, { unitPrice: getProductBasePrice(product) });
    showAlert({
      title: 'Added to cart',
      message: `${product.name} is ready in your cart.`,
      tone: 'success',
      actionLabel: 'View Cart',
      onAction: () => navigation.navigate('CustomerTabs', { screen: 'Cart' }),
    });
  };

  const handleVariantSelect = (variant: import('../../types/models').ProductVariant, quantity: number) => {
    if (!variantPickerProduct) return;
    const variantPrice = getProductBasePrice(variantPickerProduct) + variant.priceDelta;
    addItem(variantPickerProduct, quantity, {
      variantId: variant.id,
      variantLabel: variant.value,
      unitPrice: variantPrice,
    });
    showAlert({
      title: 'Added to cart',
      message: `${variantPickerProduct.name} (${variant.value}) × ${quantity} is ready in your cart.`,
      tone: 'success',
      actionLabel: 'View Cart',
      onAction: () => navigation.navigate('CustomerTabs', { screen: 'Cart' }),
    });
  };

  const allCategories = useMemo(() => {
    const base: Category[] = [{ id: 'all', name: 'All' }];
    const categoryIdsWithProducts = new Set(products.map((p) => p.categoryId));
    return [...base, ...categories.filter((c) => c.id !== 'all' && categoryIdsWithProducts.has(c.id))];
  }, [categories, products]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || loading || loadingMoreRef.current) return;
    setPage((prev) => prev + 1);
  }, [hasNextPage, loading]);

  const productsByCategory = useMemo(() => {
    if (selectedCategory !== 'all') {
      return [{ category: categories.find((c) => c.id === selectedCategory), products }];
    }

    const grouped: Array<{ category: Category; products: Product[] }> = [];
    const categoryMap = new Map<string, Product[]>();

    for (const product of products) {
      const catId = product.categoryId;
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, []);
      }
      categoryMap.get(catId)!.push(product);
    }

    for (const category of categories) {
      if (category.id === 'all') continue;
      const catProducts = categoryMap.get(category.id);
      if (catProducts && catProducts.length > 0) {
        grouped.push({ category, products: catProducts });
      }
    }

    return grouped;
  }, [products, categories, selectedCategory]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.fixedHeader, { paddingTop: insets.top + 4, paddingHorizontal: 14, backgroundColor: theme.colors.background }]}>
        <View style={styles.headerRow}>
          <LogoHeader />
          <View style={styles.chatBtnWrap}>
            <Pressable
              style={styles.headerChatBtn}
              onPress={() => navigation.navigate('ChatSeller')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.text} />
              {chatUnreadCount > 0 && (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</Text>
                </View>
              )}
            </Pressable>
            <GreetingBubble
              onPress={() => navigation.navigate('ChatSeller')}
              primaryColor={theme.colors.primary}
            />
          </View>
        </View>

        {banners.length > 0 ? (
          <Pressable onPress={() => setBannerFullscreen(true)}>
            <View style={styles.bannerSlideshow}>
              <View style={styles.bannerInner}>
                <Image
                  source={{ uri: banners[activeBannerIndex]?.image_url }}
                  style={styles.bannerImage}
                  resizeMode="cover"
                />
              </View>
              {banners.length > 1 ? (
                <View style={styles.bannerDots}>
                  {banners.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.bannerDot,
                        { backgroundColor: index === activeBannerIndex ? theme.colors.primary : 'rgba(255,255,255,0.5)' },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </Pressable>
        ) : null}

        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
            <View style={styles.searchInputWrap}>
              <AppTextInput
                webName="home-product-search"
                value={search}
                onChangeText={setSearch}
                placeholder=""
                accessibilityLabel="Search Products"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={[styles.searchInput, { color: theme.colors.text }]}
              />
              {!searchFocused && search.length === 0 && typingPlaceholder.length > 0 ? (
                <Text style={[styles.typingOverlay, { color: theme.colors.textMuted }]} pointerEvents="none">
                  {typingPlaceholder}
                </Text>
              ) : null}
            </View>
          </View>
          <Pressable
            style={[styles.filterButton, { backgroundColor: theme.colors.primary }]}
            onPress={() => setFilterVisible(true)}
          >
            <Ionicons name="options-outline" size={20} color={theme.colors.primaryContrast} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {allCategories.map((category) => {
            const active = category.id === selectedCategory;
            const icon = getCategoryIcon(category.name, category.icon);
            return (
              <Pressable
                key={category.id}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: active ? theme.colors.primary : `${theme.colors.surface}CC`,
                    borderColor: active ? theme.colors.primary : `${theme.colors.border}88`,
                  },
                ]}
                onPress={() => setSelectedCategory(category.id)}
              >
                {category.id !== 'all' ? (
                  (category as any).imageUrl ? (
                    <Image source={{ uri: (category as any).imageUrl }} style={styles.categoryImg} />
                  ) : (
                    <Text style={styles.categoryIcon}>{icon}</Text>
                  )
                ) : null}
                <Text style={[styles.categoryChipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading && page === 1 ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 60 }} />
      ) : !loading && products.length === 0 ? (
        <EmptyState title="No products found" subtitle="Try another category or search keyword." />
      ) : (
        <ScrollView
          style={styles.productsScroll}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 8) + BOTTOM_TAB_HEIGHT, paddingTop: 6 }}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
            if (isNearBottom) loadMore();
          }}
          scrollEventThrottle={16}
        >
          {productsByCategory.map((group) => (
            <View key={group.category?.id ?? 'solo'} style={styles.categorySection}>
              {selectedCategory === 'all' && group.category ? (
                <View
                  style={[
                    styles.categorySectionHeader,
                    {
                      backgroundColor: `${theme.colors.card}DD`,
                      borderColor: `${theme.colors.primary}24`,
                    },
                  ]}
                >
                  <View style={styles.categorySectionLeft}>
                    <View style={[styles.categorySectionIconWrap, { backgroundColor: `${theme.colors.primary}15` }]}>
                      {(group.category as any).imageUrl ? (
                        <Image source={{ uri: (group.category as any).imageUrl }} style={styles.categorySectionImage} />
                      ) : (
                        <Text style={styles.categorySectionEmoji}>
                          {getCategoryIcon(group.category.name, group.category.icon)}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.categorySectionTitle, { color: theme.colors.text }]}>
                      {group.category.name}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.seeAllBtn}
                    onPress={() => setSelectedCategory(group.category!.id)}
                  >
                    <Text style={[styles.seeAllText, { color: theme.colors.primary }]}>See All</Text>
                    <Ionicons name="chevron-forward" size={13} color={theme.colors.primary} />
                  </Pressable>
                </View>
              ) : null}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryProductsRow}
              >
                {group.products.map((product) => (
                  <View key={product.id} style={{ width: CARD_WIDTH, marginRight: CARD_GAP }}>
                    <ProductCard
                      product={product}
                      onPress={() => navigation.navigate('ProductDetail', { product })}
                      onAdd={() => handleAddToCart(product)}
                      wishlisted={wishlistIds.includes(product.id)}
                      onToggleWishlist={() => onToggleWishlist(product.id)}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          ))}

          {loading && page > 1 ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 16 }} />
          ) : null}
        </ScrollView>
      )}

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
      <VariantPickerModal
        visible={variantPickerVisible}
        product={variantPickerProduct}
        onSelect={handleVariantSelect}
        onClose={() => { setVariantPickerVisible(false); setVariantPickerProduct(null); }}
      />

      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        categories={allCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        sortBy={sortBy}
        onSelectSort={setSortBy}
      />

      <Modal visible={bannerFullscreen} transparent animationType="fade" onRequestClose={() => setBannerFullscreen(false)}>
        <Pressable style={styles.fullscreenOverlay} onPress={() => setBannerFullscreen(false)}>
          {banners[activeBannerIndex]?.image_url ? (
            <Image
              source={{ uri: banners[activeBannerIndex].image_url }}
              style={styles.fullscreenBlurredBg}
              blurRadius={40}
              resizeMode="cover"
            />
          ) : null}
          <View style={styles.fullscreenDimOverlay} />
          <Pressable style={styles.fullscreenContainer} onPress={() => {}}>
            <Image
              source={{ uri: banners[activeBannerIndex]?.image_url }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
            <Pressable style={styles.fullscreenClose} onPress={() => setBannerFullscreen(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedHeader: {
    paddingBottom: 4,
    zIndex: 100,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerChatBtn: {
    alignItems: 'center',
    borderRadius: 20,
    height: 38,
    justifyContent: 'center',
    position: 'relative',
    width: 38,
  },
  chatBtnWrap: {
    overflow: 'visible',
    position: 'relative',
  },
  chatBadge: {
    alignItems: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#fff',
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -2,
    top: -2,
  },
  chatBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  bannerSlideshow: {
    aspectRatio: 16 / 9,
    backgroundColor: '#F5F0EB',
    borderRadius: 18,
    marginHorizontal: 2,
    marginTop: 6,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  bannerInner: {
    borderRadius: 14,
    flex: 1,
    overflow: 'hidden',
  },
  bannerImage: {
    height: '100%',
    width: '100%',
  },
  bannerDots: {
    bottom: 8,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    position: 'absolute',
    width: '100%',
    zIndex: 5,
  },
  bannerDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: '#F5F0EB',
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: {
    borderWidth: 0,
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    outlineWidth: 0,
    paddingVertical: 11,
  },
  searchInputWrap: {
    flex: 1,
    position: 'relative',
  },
  typingOverlay: {
    fontSize: 13,
    fontWeight: '500',
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 11,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  categoryRow: {
    gap: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  categoryChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  categoryIcon: {
    fontSize: 12,
  },
  categoryImg: {
    borderRadius: 4,
    height: 16,
    width: 16,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  productsScroll: {
    flex: 1,
  },
  categorySection: {
    marginBottom: 12,
  },
  categorySectionHeader: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  categorySectionLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  categorySectionIconWrap: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  categorySectionEmoji: {
    fontSize: 14,
  },
  categorySectionImage: {
    borderRadius: 7,
    height: 24,
    width: 24,
  },
  categorySectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  seeAllBtn: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryProductsRow: {
    paddingHorizontal: 14,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenBlurredBg: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
  },
  fullscreenDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  fullscreenContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  fullscreenImage: {
    width: '90%',
    height: '55%',
    borderRadius: 18,
  },
  fullscreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
});
