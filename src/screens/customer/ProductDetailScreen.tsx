import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { VariantSelectModal } from '../../components/VariantSelectModal';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchProductById, fetchPublicProducts } from '../../services/productService';
import { fetchProductReviews } from '../../services/reviewService';
import { useCartStore } from '../../store/cartStore';
import { Product, ProductReview, ProductVariant } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { getVariantUnitPrice, getProductBasePrice, getDiscountPercentFromPrice } from '../../utils/pricing';

type ProductDetailRoute = RouteProp<CustomerStackParamList, 'ProductDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GALLERY_HEIGHT = 280;
const THUMB_SIZE = 48;

function getTotalStock(product: Product): number {
  const activeVariants = (product.variants ?? []).filter(
    (v) => v.isActive && Number.isFinite(v.stockOverride),
  );
  if (activeVariants.length > 0) {
    return activeVariants.reduce((sum, v) => sum + Number(v.stockOverride), 0);
  }
  return product.stock;
}

export function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<ProductDetailRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const addItem = useCartStore((state) => state.addItem);
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const galleryRef = useRef<ScrollView | null>(null);

  const [product, setProduct] = useState<Product>(route.params.product);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [variantModalVisible, setVariantModalVisible] = useState(false);
  const [pendingBuyNow, setPendingBuyNow] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetchProductById(route.params.product.id)
      .then((row) => { if (row) setProduct(row); })
      .catch(() => {});
  }, [route.params.product.id]);

  useEffect(() => {
    if (!product.categoryId) return;
    fetchPublicProducts({ categoryId: product.categoryId })
      .then((rows) => setSimilarProducts(rows.filter((p) => p.id !== product.id).slice(0, 10)))
      .catch(() => setSimilarProducts([]));
  }, [product.id, product.categoryId]);

  useEffect(() => {
    fetchProductReviews(route.params.product.id)
      .then(setReviews)
      .catch(() => setReviews([]));
  }, [route.params.product.id]);

  useEffect(() => { setActiveImageIndex(0); }, [product.id, product.images?.length, product.imageUrl]);

  const totalImages = product.images?.length ? product.images.length : product.imageUrl ? 1 : 0;

  useEffect(() => {
    if (totalImages <= 1) return;
    const timer = setInterval(() => {
      setActiveImageIndex((prev) => {
        const next = (prev + 1) % totalImages;
        galleryRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
        return next;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [SCREEN_WIDTH, totalImages]);

  const activeVariants = useMemo(() => (product.variants ?? []).filter((v) => v.isActive), [product.variants]);
  const selectedVariant = useMemo<ProductVariant | undefined>(() => activeVariants.find((v) => v.id === selectedVariantId), [activeVariants, selectedVariantId]);
  const effectivePrice = useMemo(() => getVariantUnitPrice(product, selectedVariant), [product, selectedVariant]);

  const derivedStock = useMemo(() => {
    if (selectedVariant) {
      return selectedVariant.stockOverride ?? product.stock;
    }
    return getTotalStock(product);
  }, [selectedVariant, product]);

  const outOfStock = derivedStock <= 0;
  const stockLevel = derivedStock;
  const images = product.images?.length ? product.images : product.imageUrl ? [{ id: 'fallback', productId: product.id, imageUrl: product.imageUrl, sortOrder: 0 }] : [];
  const averageRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  const priceRange = useMemo(() => {
    if (activeVariants.length <= 1) return null;
    const prices = activeVariants.map((v) => getVariantUnitPrice(product, v));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return null;
    return { min, max };
  }, [activeVariants, product]);

  const hasSalePrice = product.onSale && product.salePrice != null && product.salePrice < product.price;
  const productHasVariants = activeVariants.length > 0;

  const openImagePreview = (imgs: string[], index = 0) => {
    if (!imgs.length) return;
    setPreviewImages(imgs);
    setPreviewIndex(index);
    setPreviewVisible(true);
  };

  const galleryImages = images.map((img) => img.imageUrl);
  const stockColor = outOfStock ? theme.colors.danger : stockLevel <= 5 ? theme.colors.warning : theme.colors.success;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Image Gallery — contained in card */}
        <View style={styles.galleryCard}>
          <ScrollView
            ref={(ref) => { galleryRef.current = ref; }}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setActiveImageIndex(Math.max(0, Math.min(next, Math.max(0, images.length - 1))));
            }}
          >
            {images.length ? (
              images.map((img, idx) => (
                <Pressable
                  key={img.id}
                  style={styles.imageSlide}
                  onPress={() => openImagePreview(galleryImages, idx)}
                >
                  <Image source={{ uri: img.imageUrl }} style={styles.productImage} resizeMode="contain" />
                </Pressable>
              ))
            ) : (
              <View style={[styles.imageSlide, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
              </View>
            )}
          </ScrollView>

          {/* Overlay tags — top left */}
          <View style={styles.imageOverlayTags}>
            {product.categoryName ? (
              <View style={[styles.imageTag, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                <Ionicons name="pricetag-outline" size={10} color="#fff" />
                <Text style={styles.imageTagText}>{product.categoryName}</Text>
              </View>
            ) : null}
            <View style={[styles.imageTag, { backgroundColor: stockColor + 'CC' }]}>
              <View style={[styles.imageStockDot, { backgroundColor: '#fff' }]} />
              <Text style={styles.imageTagText}>
                {outOfStock ? 'Out of stock' : stockLevel <= 5 ? `Only ${stockLevel}` : `${stockLevel} in stock`}
              </Text>
            </View>
          </View>

          {images.length > 1 ? (
            <View style={styles.dotOverlay}>
              {images.map((img, idx) => (
                <View
                  key={img.id}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: idx === activeImageIndex ? theme.colors.primary : theme.colors.border,
                      width: idx === activeImageIndex ? 16 : 6,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Product Info Card */}
        <View style={[styles.infoCard, { backgroundColor: theme.colors.card }]}>
          {/* Name */}
          <Text style={[styles.productName, { color: theme.colors.text }]} numberOfLines={2}>
            {product.name}
          </Text>

          {/* Price */}
          <View style={styles.priceRow}>
            {hasSalePrice ? (
              <>
                <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
                  {formatPHP(product.salePrice!)}
                </Text>
                <Text style={[styles.priceStrikethrough, { color: theme.colors.textMuted }]}>
                  {formatPHP(product.price)}
                </Text>
                <View style={[styles.discountPill, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={styles.discountPillText}>
                    -{getDiscountPercentFromPrice(product.price, product.salePrice, product.onSale)}%
                  </Text>
                </View>
              </>
            ) : priceRange ? (
              <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
                {formatPHP(priceRange.min)} – {formatPHP(priceRange.max)}
              </Text>
            ) : (
              <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
                {formatPHP(getProductBasePrice(product))}
              </Text>
            )}
          </View>

          {/* Rating */}
          {reviews.length > 0 && (
            <View style={styles.ratingRow}>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Ionicons
                    key={s}
                    name={s <= Math.round(averageRating) ? 'star' : 'star-outline'}
                    size={13}
                    color="#F59E0B"
                  />
                ))}
              </View>
              <Text style={[styles.ratingText, { color: theme.colors.textMuted }]}>
                {averageRating.toFixed(1)} ({reviews.length})
              </Text>
            </View>
          )}

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

          {/* Description */}
          {product.description ? (
            <Text style={[styles.description, { color: theme.colors.textMuted }]}>
              {product.description}
            </Text>
          ) : null}
        </View>

        {/* Variant Selector */}
        {productHasVariants ? (
          <Pressable
            style={[styles.infoCard, { backgroundColor: theme.colors.card }]}
            onPress={() => setVariantModalVisible(true)}
          >
            <View style={styles.variantRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.variantLabel, { color: theme.colors.text }]}>Variant</Text>
                {selectedVariant ? (
                  <Text style={[styles.variantValue, { color: theme.colors.primary }]}>
                    {selectedVariant.name}: {selectedVariant.value}
                  </Text>
                ) : (
                  <Text style={[styles.variantValue, { color: theme.colors.textMuted }]}>
                    {activeVariants.length} options
                  </Text>
                )}
              </View>
              <View style={styles.swatchRow}>
                {activeVariants.slice(0, 5).map((v) => {
                  const active = v.id === selectedVariantId;
                  return (
                    <View
                      key={v.id}
                      style={[
                        styles.swatch,
                        {
                          borderColor: active ? theme.colors.primary : 'transparent',
                          backgroundColor: active ? theme.colors.primary + '12' : theme.colors.surfaceAlt,
                        },
                      ]}
                    >
                      {v.imageUrl ? (
                        <Image source={{ uri: v.imageUrl }} style={styles.swatchImg} />
                      ) : (
                        <Text style={[styles.swatchLabel, { color: active ? theme.colors.primary : theme.colors.textMuted }]} numberOfLines={1}>
                          {v.value}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </View>
          </Pressable>
        ) : null}

        {/* Reviews */}
        <View style={[styles.infoCard, { backgroundColor: theme.colors.card }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Ionicons name="chatbubbles" size={15} color="#F59E0B" />
              <Text style={[styles.sectionLabel, { color: theme.colors.text }]}>Reviews</Text>
              {reviews.length > 0 && (
                <Text style={[styles.sectionCount, { color: theme.colors.textMuted }]}>{reviews.length}</Text>
              )}
            </View>
            {reviews.length > 0 && (
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={10} color="#fff" />
                <Text style={styles.ratingPillText}>{averageRating.toFixed(1)}</Text>
              </View>
            )}
          </View>

          {reviews.length === 0 ? (
            <View style={styles.emptyReviews}>
              <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.colors.border} />
              <Text style={[styles.emptyReviewsText, { color: theme.colors.textMuted }]}>No reviews yet</Text>
            </View>
          ) : (
            reviews.slice(0, 3).map((review, idx) => (
              <View
                key={review.id}
                style={[styles.reviewCard, { borderColor: theme.colors.border }, idx === 0 && { borderTopWidth: 0 }]}
              >
                <View style={styles.reviewTop}>
                  <View style={styles.reviewAvatar}>
                    <Text style={styles.reviewAvatarText}>
                      {(review.authorName || 'C')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reviewAuthor, { color: theme.colors.text }]}>
                      {review.authorName || 'Customer'}
                    </Text>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Ionicons key={s} name={s <= review.rating ? 'star' : 'star-outline'} size={10} color="#F59E0B" />
                      ))}
                    </View>
                  </View>
                </View>
                {review.comment ? (
                  <Text style={[styles.reviewBody, { color: theme.colors.textMuted }]}>{review.comment}</Text>
                ) : null}
                {review.images.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewImgs}>
                    {review.images.map((uri, idx2) => (
                      <Pressable key={`${review.id}-${idx2}`} onPress={() => openImagePreview(review.images, idx2)}>
                        <Image source={{ uri }} style={styles.reviewImg} />
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            ))
          )}
        </View>

        {/* Similar Items */}
        {similarProducts.length > 0 ? (
          <View style={styles.similarSection}>
            <Text style={[styles.sectionLabel, { color: theme.colors.text, marginBottom: 10, marginHorizontal: 0 }]}>Similar Items</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarScroll}>
              {similarProducts.map((item) => {
                const itemImage = item.images?.[0]?.imageUrl ?? item.imageUrl;
                const itemHasVariants = (item.variants ?? []).filter((v) => v.isActive).length > 0;
                const itemOnSale = item.onSale && item.salePrice != null && item.salePrice < item.price;
                const itemStock = getTotalStock(item);
                return (
                  <Pressable
                    key={item.id}
                    style={[styles.similarCard, { backgroundColor: theme.colors.card }]}
                    onPress={() => navigation.push('ProductDetail', { product: item })}
                  >
                    <View style={styles.similarImgWrap}>
                      {itemImage ? (
                        <Image source={{ uri: itemImage }} style={styles.similarImg} resizeMode="cover" />
                      ) : (
                        <View style={[styles.similarImg, { backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="basket-outline" size={18} color={theme.colors.textMuted} />
                        </View>
                      )}
                      {itemOnSale && item.salePrice != null ? (
                        <View style={styles.similarSaleTag}>
                          <Text style={styles.similarSaleTagText}>
                            -{getDiscountPercentFromPrice(item.price, item.salePrice, item.onSale)}%
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.similarBody}>
                      <Text style={[styles.similarName, { color: theme.colors.text }]} numberOfLines={2}>{item.name}</Text>
                      <View style={styles.similarPriceRow}>
                        {itemOnSale && item.salePrice != null ? (
                          <>
                            <Text style={[styles.similarPrice, { color: theme.colors.primary }]}>{formatPHP(item.salePrice)}</Text>
                            <Text style={[styles.similarOldPrice, { color: theme.colors.textMuted }]}>{formatPHP(item.price)}</Text>
                          </>
                        ) : (
                          <Text style={[styles.similarPrice, { color: theme.colors.primary }]}>{formatPHP(getProductBasePrice(item))}</Text>
                        )}
                      </View>
                    </View>
                    {itemHasVariants ? (
                      <Pressable
                        style={[styles.similarBtn, { backgroundColor: itemStock > 0 ? theme.colors.primary : theme.colors.surfaceAlt }]}
                        disabled={itemStock <= 0}
                        onPress={(e) => { e.stopPropagation(); navigation.push('ProductDetail', { product: item }); }}
                      >
                        <Ionicons name={itemStock > 0 ? 'options' : 'close'} size={12} color={itemStock > 0 ? '#fff' : theme.colors.textMuted} />
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[styles.similarBtn, { backgroundColor: itemStock > 0 ? theme.colors.primary : theme.colors.surfaceAlt }]}
                        disabled={itemStock <= 0}
                        onPress={(e) => {
                          e.stopPropagation();
                          addItem(item, 1);
                          showAlert({ title: 'Added', message: `${item.name} added.`, tone: 'success' });
                        }}
                      >
                        <Ionicons name={itemStock > 0 ? 'add' : 'close'} size={12} color={itemStock > 0 ? '#fff' : theme.colors.textMuted} />
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { backgroundColor: theme.colors.card, paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          style={[styles.cartBtn, { opacity: outOfStock ? 0.45 : 1 }]}
          disabled={outOfStock}
          onPress={() => { setPendingBuyNow(false); setVariantModalVisible(true); }}
        >
          <Ionicons name="cart-outline" size={18} color="#F97316" />
          <Text style={[styles.cartBtnText, { color: '#F97316' }]}>
            {outOfStock ? 'Unavailable' : 'Add to Cart'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.buyBtn, { backgroundColor: outOfStock ? theme.colors.surfaceAlt : '#EF4444' }]}
          disabled={outOfStock}
          onPress={() => { setPendingBuyNow(true); setVariantModalVisible(true); }}
        >
          <Text style={[styles.buyBtnText, { color: outOfStock ? theme.colors.textMuted : '#fff' }]}>
            {outOfStock ? 'Unavailable' : 'Buy Now'}
          </Text>
        </Pressable>
      </View>

      <ImagePreviewModal visible={previewVisible} images={previewImages} initialIndex={previewIndex} onClose={() => setPreviewVisible(false)} />
      <VariantSelectModal
        visible={variantModalVisible}
        product={product}
        selectedVariantId={selectedVariantId}
        quantity={quantity}
        onClose={() => setVariantModalVisible(false)}
        onConfirm={(variantId, qty) => {
          setSelectedVariantId(variantId);
          setQuantity(qty);
          const variant = activeVariants.find((v) => v.id === variantId);
          const price = getVariantUnitPrice(product, variant);
          addItem(product, qty, {
            variantId: variant?.id,
            variantLabel: variant ? `${variant.name}: ${variant.value}` : undefined,
            unitPrice: price,
          });
          if (pendingBuyNow) {
            setPendingBuyNow(false);
            const itemKey = `${product.id}::${variant?.id ?? 'default'}`;
            navigation.navigate('Checkout', { selectedKeys: [itemKey] });
          } else {
            showAlert({
              title: 'Added to cart',
              message: `${product.name}${variant ? ` (${variant.value})` : ''} was added to your cart.`,
              tone: 'success',
              actionLabel: 'Go to Checkout',
              onAction: () => navigation.navigate('Checkout'),
            });
          }
        }}
      />
      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: 0 },

  /* Gallery — contained card */
  galleryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  imageSlide: {
    width: SCREEN_WIDTH - 32,
    height: GALLERY_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  productImage: { width: '92%', height: '92%' },
  dotOverlay: {
    position: 'absolute',
    bottom: 10,
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 4,
  },
  dot: { borderRadius: 999, height: 6 },

  /* Info Card */
  infoCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 14,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },

  /* Product Name + Price */
  productName: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  priceValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  priceStrikethrough: {
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'line-through',
  },
  discountPill: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  discountPillText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },

  /* Rating */
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  starsRow: { flexDirection: 'row', gap: 1 },
  ratingText: { fontSize: 12, fontWeight: '600' },

  /* Divider */
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 10 },

  /* Tags */
  imageOverlayTags: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 5,
    zIndex: 10,
  },
  imageTag: {
    alignItems: 'center',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  imageTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  imageStockDot: {
    borderRadius: 999,
    height: 5,
    width: 5,
  },

  /* Description */
  description: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },

  /* Variant */
  variantRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  variantLabel: { fontSize: 13, fontWeight: '700' },
  variantValue: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  swatchRow: { flexDirection: 'row', gap: 5 },
  swatch: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    height: 28,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 28,
  },
  swatchImg: { height: '100%', width: '100%' },
  swatchLabel: { fontSize: 7, fontWeight: '700' },

  /* Reviews Section */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: { fontSize: 14, fontWeight: '700' },
  sectionCount: { fontSize: 12, fontWeight: '500' },
  ratingPill: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 3,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ratingPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  emptyReviews: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
  },
  emptyReviewsText: { fontSize: 13, fontWeight: '500' },

  /* Review Card */
  reviewCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 4,
  },
  reviewTop: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  reviewAvatar: {
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  reviewAvatarText: { color: '#D97706', fontSize: 11, fontWeight: '700' },
  reviewAuthor: { fontSize: 12, fontWeight: '700' },
  reviewStars: { flexDirection: 'row', gap: 1, marginTop: 1 },
  reviewBody: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  reviewImgs: { gap: 5, marginTop: 8 },
  reviewImg: { borderRadius: 8, height: 44, width: 44 },

  /* Similar Items */
  similarSection: {
    marginTop: 14,
    paddingLeft: 16,
  },
  similarScroll: { gap: 10, paddingRight: 16 },
  similarCard: {
    borderRadius: 12,
    overflow: 'hidden',
    width: 120,
  },
  similarImgWrap: {
    aspectRatio: 1,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  similarImg: { height: '100%', width: '100%' },
  similarSaleTag: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#DC2626',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  similarSaleTagText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  similarBody: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 2 },
  similarName: { fontSize: 11, fontWeight: '600', lineHeight: 14, minHeight: 22 },
  similarPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  similarPrice: { fontSize: 12, fontWeight: '700' },
  similarOldPrice: { fontSize: 10, fontWeight: '500', textDecorationLine: 'line-through' },
  similarBtn: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    marginRight: 6,
    marginBottom: 6,
    width: 22,
  },

  /* Bottom Bar */
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  cartBtn: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#F97316',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 13,
  },
  cartBtnText: { fontSize: 13, fontWeight: '700' },
  buyBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 13,
  },
  buyBtnText: { fontSize: 13, fontWeight: '700' },
});
