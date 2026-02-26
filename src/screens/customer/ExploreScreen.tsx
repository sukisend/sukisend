import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../../components/EmptyState';
import { ProductCard } from '../../components/ProductCard';
import { SectionHeader } from '../../components/SectionHeader';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchPublicCategories, fetchPublicProducts, fetchWishlist, toggleWishlist } from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { Category, Product, ProductSortOption } from '../../types/models';

const SORT_OPTIONS: Array<{ id: ProductSortOption; label: string }> = [
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
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const addItem = useCartStore((state) => state.addItem);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<ProductSortOption>('best_selling');
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([fetchPublicProducts({ search, categoryId: selectedCategory, sort: sortBy }), fetchPublicCategories()])
      .then(([nextProducts, nextCategories]) => {
        setProducts(nextProducts);
        setCategories(nextCategories);
      })
      .catch(() => {
        setProducts([]);
      });
  }, [search, selectedCategory, sortBy]);

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

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{
        paddingBottom: tabBarHeight + 24,
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
          {categories.map((item) => {
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

        <View style={styles.productsList}>
          {products.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              onPress={() => navigation.navigate('ProductDetail', { product: item })}
              onAdd={() => addItem(item, 1)}
              wishlisted={wishlistIds.includes(item.id)}
              onToggleWishlist={() => onToggleWishlist(item.id)}
            />
          ))}
        </View>

        {!products.length ? <EmptyState title="No products found" subtitle="Try another category or search keyword." /> : null}
      </View>
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
});
