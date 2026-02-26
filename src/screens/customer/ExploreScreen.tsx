import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { BrandedLoader } from '../../components/BrandedLoader';
import { EmptyState } from '../../components/EmptyState';
import { ProductCard } from '../../components/ProductCard';
import { SectionHeader } from '../../components/SectionHeader';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useMinimumLoader } from '../../hooks/useMinimumLoader';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchPublicCategories, fetchPublicProducts, fetchWishlist, toggleWishlist } from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { Category, Product, ProductSortOption } from '../../types/models';
import { getProductBasePrice } from '../../utils/pricing';

const PAGE_SIZE = 8;

const SORT_OPTIONS: Array<{ id: ProductSortOption; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'best_selling', label: 'By Selling' },
  { id: 'name_asc', label: 'A-Z' },
  { id: 'on_sale', label: 'On Sale' },
  { id: 'newest', label: 'Newest First' },
  { id: 'oldest', label: 'Oldest First' },
  { id: 'price_asc', label: 'Price Low-High' },
  { id: 'price_desc', label: 'Price High-Low' },
];

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const addItem = useCartStore((state) => state.addItem);
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ProductSortOption>('all');
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const showLoader = useMinimumLoader(loading, 6000);

  useEffect(() => {
    fetchPublicCategories()
      .then((rows) => setCategories(rows))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, selectedCategory, sortBy]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setLoading(true);
      try {
        const nextProducts = await fetchPublicProducts({
          search,
          categoryId: selectedCategory,
          sort: sortBy,
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
      // Ignore toggle error in explore flow.
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

  const selectableCategories = useMemo(() => {
    const base: Category[] = [{ id: 'all', name: 'All' }];
    return [...base, ...categories.filter((item) => item.id !== 'all')];
  }, [categories]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 14,
        paddingTop: insets.top + 8,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.inner}>
        <SectionHeader title="Explore Store" subtitle="Browse all product categories." />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Find product..."
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.searchInput,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
          {selectableCategories.map((item) => {
            const active = item.id === selectedCategory;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                  },
                ]}
                onPress={() => setSelectedCategory(item.id)}
              >
                <Text style={[styles.categoryText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                  {item.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortList}>
          {SORT_OPTIONS.map((option) => {
            const active = option.id === sortBy;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                  },
                ]}
                onPress={() => setSortBy(option.id)}
              >
                <Text style={[styles.sortText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {showLoader ? <BrandedLoader compact label="Loading products..." /> : null}

        <View style={styles.productsList}>
          {products.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { product: item })}
              onAdd={() => handleAddToCart(item)}
              wishlisted={wishlistIds.includes(item.id)}
              onToggleWishlist={() => onToggleWishlist(item.id)}
            />
          ))}
        </View>

        {!loading && !products.length ? (
          <EmptyState title="No products found" subtitle="Try another category or search keyword." />
        ) : null}

        {products.length > 0 || page > 1 ? (
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
      </View>
      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    gap: 10,
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryList: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    borderRadius: 999,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sortList: {
    gap: 8,
    paddingVertical: 4,
  },
  sortChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sortText: {
    fontSize: 11,
    fontWeight: '700',
  },
  productsList: {
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
    paddingBottom: 8,
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
