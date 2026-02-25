import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { EmptyState } from '../../components/EmptyState';
import { LogoHeader } from '../../components/LogoHeader';
import { ProductCard } from '../../components/ProductCard';
import { useTheme } from '../../providers/ThemeProvider';
import { useAuth } from '../../providers/AuthProvider';
import { fetchPublicCategories, fetchPublicProducts, fetchWishlist, toggleWishlist } from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { Category, Product, ProductSortOption } from '../../types/models';
import { CustomerStackParamList } from '../../navigation/types';

const SORT_OPTIONS: Array<{ id: ProductSortOption; label: string }> = [
  { id: 'best_selling', label: 'Best Selling' },
  { id: 'name_asc', label: 'A-Z' },
  { id: 'on_sale', label: 'On Sale' },
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'price_asc', label: 'Price Low-High' },
  { id: 'price_desc', label: 'Price High-Low' },
];

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
      <View style={styles.topRow}>
        <LogoHeader />
      </View>

      <LinearGradient
        colors={theme.isDark ? ['#1E293B', '#0F172A'] : ['#FED7AA', '#FDBA74']}
        style={styles.heroBanner}
      >
        <Text style={[styles.heroTitle, { color: theme.isDark ? '#F8FAFC' : '#7C2D12' }]}>Welcome to SUKI SEND</Text>
        <Text style={[styles.heroSubtitle, { color: theme.isDark ? '#CBD5E1' : '#9A3412' }]}>
          Fresh essentials and daily needs delivered quickly to your door.
        </Text>
      </LinearGradient>

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {categories.map((category) => {
          const active = category.id === selectedCategory;
          return (
            <Pressable
              key={category.id}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                },
              ]}
              onPress={() => setSelectedCategory(category.id)}
            >
              <Text style={[styles.categoryChipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
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
              <Text style={[styles.sortChipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Loading products...</Text>
      ) : null}

      <View style={styles.productsGrid}>
        {products.map((product) => (
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

      {!loading && products.length === 0 ? (
        <EmptyState title="No products found" subtitle="Try another category or search keyword." />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  heroBanner: {
    borderRadius: 20,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 6,
  },
  searchWrap: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 12,
  },
  categoryRow: {
    gap: 8,
    paddingTop: 14,
    paddingBottom: 10,
  },
  categoryChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sortRow: {
    gap: 8,
    paddingBottom: 12,
  },
  sortChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  sortChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
});
