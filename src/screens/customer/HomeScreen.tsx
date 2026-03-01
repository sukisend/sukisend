import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { EmptyState } from '../../components/EmptyState';
import { FilterModal } from '../../components/FilterModal';
import { LogoHeader } from '../../components/LogoHeader';
import { ProductCard } from '../../components/ProductCard';
import { ThemeModeToggle } from '../../components/ThemeModeToggle';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchCustomerUnreadSellerMessagesCount } from '../../services/chatModerationService';
import { fetchPublicCategories, fetchPublicProducts, fetchWishlist, toggleWishlist } from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { Category, Product, ProductSortOption } from '../../types/models';
import { getCategoryIcon } from '../../utils/categoryIcons';
import { getProductBasePrice } from '../../utils/pricing';

const PAGE_SIZE = 8;
const MARKETING_LINES = [
  'Skip long lines and shop securely from home. We deliver with care.',
  'Fast checkout, safe handling, and reliable COD delivery for your family.',
  'Essentials in minutes, less hassle in your day, more time for what matters.',
  'Your trusted local shop online: simple ordering and secure order updates.',
  'From store shelves to your doorstep, shopping made easier and safer.',
];

function getGreetingByHour() {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
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
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [welcomeBannerVisible, setWelcomeBannerVisible] = useState(true);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(true);
  const welcomeOpacity = useRef(new Animated.Value(1)).current;
  const useNativeDriver = Platform.OS !== 'web';

  const firstName = useMemo(() => {
    const value = profile?.fullName?.trim();
    return value ? value.split(/\s+/)[0] : 'Suki';
  }, [profile?.fullName]);
  const greeting = useMemo(() => getGreetingByHour(), []);
  const marketingLine = useMemo(() => {
    const index = Math.abs((new Date().getDate() + selectedCategory.length) % MARKETING_LINES.length);
    return MARKETING_LINES[index];
  }, [selectedCategory]);

  useEffect(() => {
    fetchPublicCategories()
      .then((rows) => setCategories(rows))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setShowWelcomeBanner(true);
    setWelcomeBannerVisible(true);
    welcomeOpacity.setValue(1);

    const timer = setTimeout(() => {
      Animated.timing(welcomeOpacity, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver,
      }).start(({ finished }) => {
        if (finished) {
          setShowWelcomeBanner(false);
        }
      });
      setWelcomeBannerVisible(false);
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [useNativeDriver, welcomeOpacity]);

  useEffect(() => {
    setPage(1);
  }, [selectedCategory, search, sortBy]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setLoading(true);
      try {
        const baseQuery = {
          search,
          categoryId: selectedCategory,
          sort: sortBy,
        };

        if (selectedCategory === 'all') {
          const allRows = await fetchPublicProducts(baseQuery);
          const uniqueRows = Array.from(new Map(allRows.map((item) => [item.id, item])).values());

          if (cancelled) {
            return;
          }

          setProducts(uniqueRows);
          setHasNextPage(false);
          return;
        }

        const nextProducts = await fetchPublicProducts({
          ...baseQuery,
          page,
          pageSize: PAGE_SIZE,
        });

        if (cancelled) {
          return;
        }

        if (page > 1 && nextProducts.length === 0) {
          setPage((prev) => Math.max(1, prev - 1));
          return;
        }

        setProducts(nextProducts);
        setHasNextPage(nextProducts.length === PAGE_SIZE);
      } catch {
        if (!cancelled) {
          setProducts([]);
          setHasNextPage(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
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

  useEffect(() => {
    if (role !== 'customer' || !profile?.id) {
      setChatUnreadCount(0);
      return;
    }

    let active = true;
    const syncUnread = async () => {
      try {
        const unread = await fetchCustomerUnreadSellerMessagesCount(profile.id);
        if (active) {
          setChatUnreadCount(unread);
        }
      } catch {
        if (active) {
          setChatUnreadCount(0);
        }
      }
    };

    syncUnread();
    const timer = setInterval(syncUnread, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [profile?.id, role]);

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
    addItem(product, 1, { unitPrice: getProductBasePrice(product) });
    showAlert({
      title: 'Added to cart',
      message: `${product.name} is ready in your cart.`,
      tone: 'success',
      actionLabel: 'View Cart',
      onAction: () => navigation.navigate('CustomerTabs', { screen: 'Cart' }),
    });
  };

  const productsByCategory = useMemo(() => {
    const shouldGroupByCategory = selectedCategory === 'all' && (sortBy === 'all' || sortBy === 'best_selling');

    if (!shouldGroupByCategory) {
      return [{ category: undefined, products }];
    }

    if (selectedCategory !== 'all') {
      return [{ category: categories.find((c) => c.id === selectedCategory), products }];
    }

    const grouped: Array<{ category: Category | undefined; products: Product[] }> = [];
    const categoryMap = new Map<string, Product[]>();

    for (const product of products) {
      const catId = product.categoryId;
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, []);
      }
      categoryMap.get(catId)!.push(product);
    }

    for (const category of categories) {
      if (category.id === 'all') {
        continue;
      }
      const catProducts = categoryMap.get(category.id);
      if (catProducts && catProducts.length > 0) {
        grouped.push({ category, products: catProducts });
      }
    }

    return grouped;
  }, [products, categories, selectedCategory, sortBy]);

  const allCategories = useMemo(() => {
    const base: Category[] = [{ id: 'all', name: 'All' }];
    return [...base, ...categories.filter((c) => c.id !== 'all')];
  }, [categories]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.fixedHeader, { paddingTop: insets.top + 8, paddingHorizontal: 14 }]}>
        <View style={styles.headerRow}>
          <LogoHeader />
          <View style={styles.headerActions}>
            <ThemeModeToggle compact showLabel={false} />
          </View>
        </View>
        <Pressable
          style={[styles.chatHeaderButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
          onPress={() => navigation.navigate('ChatSeller')}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={theme.colors.text} />
          <Text style={[styles.chatHeaderButtonText, { color: theme.colors.text }]}>Chat Seller</Text>
          {chatUnreadCount > 0 ? (
            <View style={[styles.chatBadge, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.chatBadgeText, { color: theme.colors.primaryContrast }]}>
                {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        {showWelcomeBanner ? (
          <Animated.View
            style={[
              styles.guestHero,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: welcomeOpacity,
              },
            ]}
            pointerEvents={welcomeBannerVisible ? 'auto' : 'none'}
          >
            <Image source={require('../../../assets/suki-send-logo.png')} style={styles.guestHeroLogo} resizeMode="contain" />
            <Text style={[styles.guestHeroTitle, { color: theme.colors.text }]}>Welcome to SUKI SEND</Text>
            <Text style={[styles.guestHeroSub, { color: theme.colors.textMuted }]}>
              Shop daily essentials with secure COD checkout and doorstep delivery.
            </Text>
          </Animated.View>
        ) : null}

        <View
          style={[
            styles.marketingBanner,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.greeting, { color: theme.colors.text }]}>
            {greeting}, {firstName}
          </Text>
          <Text style={[styles.bannerCopy, { color: theme.colors.textMuted }]}>{marketingLine}</Text>
        </View>

        <View style={styles.searchRow}>
          <View style={[styles.searchWrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search products..."
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.searchInput, { color: theme.colors.text }]}
            />
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
                    backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  },
                ]}
                onPress={() => setSelectedCategory(category.id)}
              >
                {category.id !== 'all' ? <Text style={styles.categoryIcon}>{icon}</Text> : null}
                <Text style={[styles.categoryChipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.productsScroll}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 14, paddingTop: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {productsByCategory.map((group, index) => (
          <View key={group.category?.id ?? `group-${index}`} style={styles.categorySection}>
            {group.category ? (
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionIcon}>{getCategoryIcon(group.category.name, group.category.icon)}</Text>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{group.category.name}</Text>
                <Text style={[styles.sectionCount, { color: theme.colors.textMuted }]}>
                  {group.products.length} item{group.products.length !== 1 ? 's' : ''}
                </Text>
              </View>
            ) : null}
            <View style={styles.productsGrid}>
              {group.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPress={() => navigation.navigate('ProductDetail', { product })}
                  onAdd={() => handleAddToCart(product)}
                  wishlisted={wishlistIds.includes(product.id)}
                  onToggleWishlist={() => onToggleWishlist(product.id)}
                />
              ))}
            </View>
          </View>
        ))}

        {!loading && products.length === 0 ? (
          <EmptyState title="No products found" subtitle="Try another category or search keyword." />
        ) : null}

        {selectedCategory !== 'all' && (products.length > 0 || page > 1) ? (
          <View style={styles.paginationRow}>
            <Pressable
              style={[
                styles.pageButton,
                { borderColor: theme.colors.border, backgroundColor: page === 1 ? theme.colors.surfaceAlt : theme.colors.surface },
              ]}
              disabled={page === 1}
              onPress={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              <Text style={[styles.pageButtonText, { color: page === 1 ? theme.colors.textMuted : theme.colors.text }]}>
                Previous
              </Text>
            </Pressable>
            <Text style={[styles.pageIndicator, { color: theme.colors.textMuted }]}>Page {page}</Text>
            <Pressable
              style={[
                styles.pageButton,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: !hasNextPage || loading ? theme.colors.surfaceAlt : theme.colors.surface,
                },
              ]}
              disabled={!hasNextPage || loading}
              onPress={() => setPage((prev) => prev + 1)}
            >
              <Text style={[styles.pageButtonText, { color: !hasNextPage || loading ? theme.colors.textMuted : theme.colors.text }]}>
                Next
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />

      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        categories={allCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        sortBy={sortBy}
        onSelectSort={setSortBy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedHeader: {
    paddingBottom: 8,
  },
  productsScroll: {
    flex: 1,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  chatHeaderButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 34,
    paddingHorizontal: 11,
  },
  chatHeaderButtonText: {
    fontSize: 11,
    fontWeight: '800',
  },
  chatBadge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chatBadgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  marketingBanner: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 52,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  guestHero: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  guestHeroLogo: {
    height: 74,
    width: 74,
  },
  guestHeroTitle: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },
  guestHeroSub: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 2,
    textAlign: 'center',
  },
  greeting: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  bannerCopy: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  searchWrap: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 12,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  categoryRow: {
    gap: 8,
    paddingTop: 10,
    paddingBottom: 6,
  },
  categoryChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  categorySection: {
    marginBottom: 18,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 6,
    paddingBottom: 10,
  },
  pageButton: {
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pageButtonText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  pageIndicator: {
    fontSize: 12,
    fontWeight: '700',
  },
});
