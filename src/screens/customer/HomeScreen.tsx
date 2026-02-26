import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { EmptyState } from '../../components/EmptyState';
import { FilterModal } from '../../components/FilterModal';
import { LogoHeader } from '../../components/LogoHeader';
import { ProductCard } from '../../components/ProductCard';
import { useTheme } from '../../providers/ThemeProvider';
import { useAuth } from '../../providers/AuthProvider';
import { fetchPublicCategories, fetchPublicProducts, fetchWishlist, toggleWishlist } from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { Category, Product, ProductSortOption } from '../../types/models';
import { CustomerStackParamList } from '../../navigation/types';
import { getCategoryIcon } from '../../utils/categoryIcons';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const addItem = useCartStore((state) => state.addItem);

  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ProductSortOption>('best_selling');
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [filterVisible, setFilterVisible] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [nextCategories, nextProducts] = await Promise.all([
        fetchPublicCategories(),
        fetchPublicProducts({ search, categoryId: selectedCategory, sort: sortBy }),
      ]);
      setCategories(nextCategories);
      setProducts(nextProducts);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCategory, search, sortBy]);

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

  // Group products by category
  const productsByCategory = useMemo(() => {
    if (selectedCategory !== 'all') {
      // Single category selected — just show flat list
      return [{ category: categories.find((c) => c.id === selectedCategory), products }];
    }

    // Group by category
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
      if (category.id === 'all') continue;
      const catProducts = categoryMap.get(category.id);
      if (catProducts && catProducts.length > 0) {
        grouped.push({ category, products: catProducts });
      }
    }

    return grouped;
  }, [products, categories, selectedCategory]);

  // Categories with "All" for filter
  const allCategories = useMemo(() => {
    const base: Category[] = [{ id: 'all', name: 'All' }];
    return [...base, ...categories.filter((c) => c.id !== 'all')];
  }, [categories]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        paddingBottom: tabBarHeight + 22,
        paddingHorizontal: 14,
        paddingTop: insets.top + 10,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <LogoHeader />
      </View>

      {/* Search + Filter */}
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

      {/* Category Chips */}
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

      {/* Products grouped by category */}
      {loading ? (
        <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Loading products...</Text>
      ) : null}

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
                onAdd={() => addItem(product, 1)}
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

      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        categories={allCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        sortBy={sortBy}
        onSelectSort={setSortBy}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
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
    paddingTop: 14,
    paddingBottom: 10,
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
  helperText: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 8,
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
});
