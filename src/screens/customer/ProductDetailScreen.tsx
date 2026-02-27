import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchProductById, fetchProductReviews } from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { Product, ProductReview, ProductVariant } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { getVariantUnitPrice } from '../../utils/pricing';

type ProductDetailRoute = RouteProp<CustomerStackParamList, 'ProductDetail'>;

export function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<ProductDetailRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const addItem = useCartStore((state) => state.addItem);
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const screenWidth = Dimensions.get('window').width;
  const galleryRef = useRef<ScrollView | null>(null);

  const [product, setProduct] = useState<Product>(route.params.product);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

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

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product.id, product.images?.length, product.imageUrl]);

  const totalImages = product.images?.length ? product.images.length : product.imageUrl ? 1 : 0;

  useEffect(() => {
    if (totalImages <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setActiveImageIndex((prev) => {
        const next = (prev + 1) % totalImages;
        galleryRef.current?.scrollTo({ x: next * (screenWidth - 28), animated: true });
        return next;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [screenWidth, totalImages]);

  const activeVariants = useMemo(
    () => (product.variants ?? []).filter((item) => item.isActive),
    [product.variants],
  );
  const selectedVariant = useMemo<ProductVariant | undefined>(
    () => activeVariants.find((item) => item.id === selectedVariantId),
    [activeVariants, selectedVariantId],
  );
  const effectivePrice = useMemo(
    () => getVariantUnitPrice(product, selectedVariant),
    [product, selectedVariant],
  );

  const outOfStock = (selectedVariant?.stockOverride ?? product.stock) <= 0;
  const maxStock = selectedVariant?.stockOverride ?? product.stock;
  const images = product.images?.length
    ? product.images
    : product.imageUrl
      ? [{ id: 'fallback', productId: product.id, imageUrl: product.imageUrl, sortOrder: 0 }]
      : [];
  const averageRating = reviews.length ? reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length : 0;

  const openImagePreview = (imagesToPreview: string[], index = 0) => {
    if (!imagesToPreview.length) {
      return;
    }
    setPreviewImages(imagesToPreview);
    setPreviewIndex(index);
    setPreviewVisible(true);
  };

  const addToCart = () => {
    addItem(product, quantity, {
      variantId: selectedVariant?.id,
      variantLabel: selectedVariant ? `${selectedVariant.name}: ${selectedVariant.value}` : undefined,
      unitPrice: effectivePrice,
    });
    showAlert({
      title: 'Added to cart',
      message: `${product.name} was added to your cart.`,
      tone: 'success',
      actionLabel: 'Go to Checkout',
      onAction: () => navigation.navigate('Checkout'),
    });
  };

  const galleryImages = images.map((image) => image.imageUrl);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <ScrollView
        ref={(instance) => {
          galleryRef.current = instance;
        }}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.gallery}
        contentContainerStyle={styles.galleryContent}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.x / (screenWidth - 28));
          setActiveImageIndex(Math.max(0, Math.min(nextIndex, Math.max(0, images.length - 1))));
        }}
      >
        {images.length ? (
          images.map((image, index) => (
            <Pressable
              key={image.id}
              style={[styles.imageWrap, { backgroundColor: theme.colors.surfaceAlt, width: screenWidth - 28 }]}
              onPress={() => openImagePreview(galleryImages, index)}
            >
              <Image source={{ uri: image.imageUrl }} style={styles.image} resizeMode="cover" />
            </Pressable>
          ))
        ) : (
          <View style={[styles.imageWrap, { backgroundColor: theme.colors.surfaceAlt, width: screenWidth - 28 }]}>
            <Ionicons name="cube-outline" size={28} color={theme.colors.textMuted} />
          </View>
        )}
      </ScrollView>
      {images.length > 1 ? (
        <View style={styles.galleryControls}>
          <Pressable
            style={[styles.galleryNavBtn, activeImageIndex === 0 ? styles.galleryNavDisabled : null]}
            disabled={activeImageIndex === 0}
            onPress={() => {
              const next = Math.max(0, activeImageIndex - 1);
              setActiveImageIndex(next);
              galleryRef.current?.scrollTo({ x: next * (screenWidth - 28), animated: true });
            }}
          >
            <Ionicons name="chevron-back" size={15} color={theme.colors.text} />
            <Text style={[styles.galleryNavText, { color: theme.colors.text }]}>Prev</Text>
          </Pressable>
          <View style={styles.galleryDots}>
            {images.map((image, index) => (
              <Pressable
                key={image.id}
                style={[
                  styles.galleryDot,
                  {
                    backgroundColor: index === activeImageIndex ? theme.colors.primary : theme.colors.border,
                  },
                ]}
                onPress={() => {
                  setActiveImageIndex(index);
                  galleryRef.current?.scrollTo({ x: index * (screenWidth - 28), animated: true });
                }}
              />
            ))}
          </View>
          <Pressable
            style={[styles.galleryNavBtn, activeImageIndex >= images.length - 1 ? styles.galleryNavDisabled : null]}
            disabled={activeImageIndex >= images.length - 1}
            onPress={() => {
              const next = Math.min(images.length - 1, activeImageIndex + 1);
              setActiveImageIndex(next);
              galleryRef.current?.scrollTo({ x: next * (screenWidth - 28), animated: true });
            }}
          >
            <Text style={[styles.galleryNavText, { color: theme.colors.text }]}>Next</Text>
            <Ionicons name="chevron-forward" size={15} color={theme.colors.text} />
          </Pressable>
        </View>
      ) : null}

      <Text style={[styles.title, { color: theme.colors.text }]}>{product.name}</Text>
      <Text style={[styles.price, { color: theme.colors.primary }]}>{formatPHP(effectivePrice)}</Text>
      {selectedVariantId === null && product.onSale && product.salePrice !== undefined && product.salePrice < product.price ? (
        <Text style={[styles.oldPrice, { color: theme.colors.textMuted }]}>{formatPHP(product.price)}</Text>
      ) : null}
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
            <Pressable
              style={[
                styles.variantChip,
                {
                  backgroundColor: selectedVariantId === null ? theme.colors.primary : theme.colors.surfaceAlt,
                },
              ]}
              onPress={() => setSelectedVariantId(null)}
            >
              <Text
                style={[
                  styles.variantText,
                  { color: selectedVariantId === null ? theme.colors.primaryContrast : theme.colors.text },
                ]}
              >
                {product.name} ({formatPHP(getVariantUnitPrice(product))})
              </Text>
            </Pressable>
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
                    {' '}
                    ({formatPHP(getVariantUnitPrice(product, variant))})
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
        {reviews.slice(0, 4).map((review) => (
          <View key={review.id} style={styles.reviewItem}>
            <Text style={[styles.reviewAuthor, { color: theme.colors.text }]}>{review.authorName || 'Customer'}</Text>
            <Text style={[styles.reviewMeta, { color: theme.colors.textMuted }]}>
              {'★'.repeat(Math.max(1, Math.min(5, review.rating)))} {review.comment || 'No comment'}
            </Text>
            {review.images.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewImageRow}>
                {review.images.map((uri, index) => (
                  <Pressable key={`${review.id}-${index}`} onPress={() => openImagePreview(review.images, index)}>
                    <Image source={{ uri }} style={styles.reviewImageThumb} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
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
        <Text
          style={[
            styles.primaryButtonText,
            { color: outOfStock ? theme.colors.textMuted : theme.colors.primaryContrast },
          ]}
        >
          {outOfStock ? 'Stock Unavailable' : 'Add to Cart'}
        </Text>
      </Pressable>

      <ImagePreviewModal
        visible={previewVisible}
        images={previewImages}
        initialIndex={previewIndex}
        onClose={() => setPreviewVisible(false)}
      />
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
  gallery: {
    marginBottom: 8,
  },
  galleryContent: {
    gap: 10,
  },
  imageWrap: {
    alignItems: 'center',
    borderRadius: 18,
    height: 286,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  galleryControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  galleryNavBtn: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  galleryNavDisabled: {
    opacity: 0.45,
  },
  galleryNavText: {
    fontSize: 12,
    fontWeight: '700',
  },
  galleryDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  galleryDot: {
    borderRadius: 999,
    height: 7,
    width: 22,
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
  oldPrice: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    textDecorationLine: 'line-through',
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
  reviewImageRow: {
    gap: 8,
    marginTop: 8,
  },
  reviewImageThumb: {
    borderRadius: 8,
    height: 68,
    width: 68,
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
