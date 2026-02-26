import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CustomerStackParamList } from '../../navigation/types';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchProductById, fetchProductReviews } from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { Product, ProductReview, ProductVariant } from '../../types/models';
import { formatPHP } from '../../utils/currency';

type ProductDetailRoute = RouteProp<CustomerStackParamList, 'ProductDetail'>;

export function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<ProductDetailRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const addItem = useCartStore((state) => state.addItem);

  const [product, setProduct] = useState<Product>(route.params.product);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState<ProductReview[]>([]);

  useEffect(() => {
    fetchProductById(route.params.product.id)
      .then((row) => {
        if (row) {
          setProduct(row);
        }
      })
      .catch(() => {
        // Keep route payload if fetch fails.
      });
  }, [route.params.product.id]);

  useEffect(() => {
    fetchProductReviews(route.params.product.id)
      .then(setReviews)
      .catch(() => setReviews([]));
  }, [route.params.product.id]);

  const activeVariants = useMemo(
    () => (product.variants ?? []).filter((item) => item.isActive),
    [product.variants],
  );
  const selectedVariant = useMemo<ProductVariant | undefined>(
    () => activeVariants.find((item) => item.id === selectedVariantId),
    [activeVariants, selectedVariantId],
  );
  const effectivePrice = useMemo(
    () => product.price + (selectedVariant?.priceDelta ?? 0),
    [product.price, selectedVariant?.priceDelta],
  );

  const outOfStock = (selectedVariant?.stockOverride ?? product.stock) <= 0;
  const maxStock = selectedVariant?.stockOverride ?? product.stock;
  const images = product.images?.length
    ? product.images
    : product.imageUrl
      ? [{ id: 'fallback', productId: product.id, imageUrl: product.imageUrl, sortOrder: 0 }]
      : [];
  const averageRating = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0;

  const addToCart = () => {
    addItem(product, quantity, {
      variantId: selectedVariant?.id,
      variantLabel: selectedVariant ? `${selectedVariant.name}: ${selectedVariant.value}` : undefined,
      unitPrice: effectivePrice,
    });
    navigation.navigate('Checkout');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
        {images.length ? (
          images.map((image) => (
            <View key={image.id} style={[styles.imageWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Image source={{ uri: image.imageUrl }} style={styles.image} />
            </View>
          ))
        ) : (
          <View style={[styles.imageWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Ionicons name="cube-outline" size={28} color={theme.colors.textMuted} />
          </View>
        )}
      </ScrollView>

      <Text style={[styles.title, { color: theme.colors.text }]}>{product.name}</Text>
      <Text style={[styles.price, { color: theme.colors.primary }]}>{formatPHP(effectivePrice)}</Text>
      <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
        Category: {product.categoryName} | Unit: {product.unit}
      </Text>
      <Text style={[styles.meta, { color: outOfStock ? theme.colors.danger : theme.colors.success }]}>
        {outOfStock ? 'Out of stock' : `Available stock: ${maxStock}`}
      </Text>
      <Text style={[styles.description, { color: theme.colors.textMuted }]}>
        {product.description || 'No product description provided.'}
      </Text>

      {activeVariants.length ? (
        <View style={styles.variantWrap}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Choose variant</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variantRow}>
            {activeVariants.map((variant) => {
              const active = variant.id === selectedVariantId;
              return (
                <Pressable
                  key={variant.id}
                  style={[
                    styles.variantChip,
                    {
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                    },
                  ]}
                  onPress={() => setSelectedVariantId(active ? null : variant.id)}
                >
                  <Text style={[styles.variantText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                    {variant.value}
                    {variant.priceDelta ? ` (${variant.priceDelta > 0 ? '+' : ''}${formatPHP(variant.priceDelta)})` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.qtyRow}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Quantity</Text>
        <View style={styles.qtyControls}>
          <Pressable
            style={[styles.qtyButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
            onPress={() => setQuantity((prev) => Math.max(1, prev - 1))}
          >
            <Text style={[styles.qtyButtonText, { color: theme.colors.text }]}>-</Text>
          </Pressable>
          <Text style={[styles.qtyValue, { color: theme.colors.text }]}>{quantity}</Text>
          <Pressable
            style={[styles.qtyButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
            onPress={() => setQuantity((prev) => Math.min(maxStock, prev + 1))}
          >
            <Text style={[styles.qtyButtonText, { color: theme.colors.text }]}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.reviewCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Customer Reviews</Text>
        <Text style={[styles.reviewScore, { color: theme.colors.text }]}>
          {reviews.length ? `${averageRating.toFixed(1)} / 5 (${reviews.length} reviews)` : 'No reviews yet'}
        </Text>
        {reviews.slice(0, 3).map((review) => (
          <View key={review.id} style={styles.reviewItem}>
            <Text style={[styles.reviewAuthor, { color: theme.colors.text }]}>{review.authorName || 'Customer'}</Text>
            <Text style={[styles.reviewMeta, { color: theme.colors.textMuted }]}>
              {'★'.repeat(Math.max(1, Math.min(5, review.rating)))} {review.comment || 'No comment'}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[
          styles.primaryButton,
          {
            backgroundColor: outOfStock ? theme.colors.surfaceAlt : theme.colors.primary,
          },
        ]}
        disabled={outOfStock}
        onPress={addToCart}
      >
        <Text style={[styles.primaryButtonText, { color: outOfStock ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
          {outOfStock ? 'Stock Unavailable' : 'Add to Cart & Checkout'}
        </Text>
      </Pressable>
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
  gallery: {
    marginBottom: 8,
  },
  imageWrap: {
    alignItems: 'center',
    borderRadius: 18,
    height: 250,
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
    width: 320,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  price: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  meta: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  variantWrap: {
    marginTop: 14,
  },
  variantRow: {
    gap: 8,
    marginTop: 8,
  },
  variantChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  variantText: {
    fontSize: 12,
    fontWeight: '700',
  },
  qtyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  qtyControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
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
    fontSize: 16,
    fontWeight: '900',
  },
  qtyValue: {
    fontSize: 15,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  reviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    padding: 12,
  },
  reviewScore: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  reviewItem: {
    marginTop: 8,
  },
  reviewAuthor: {
    fontSize: 12,
    fontWeight: '700',
  },
  reviewMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    borderRadius: 999,
    marginTop: 20,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
