import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';
import { Product } from '../types/models';
import { formatPHP } from '../utils/currency';
import { getProductBasePrice } from '../utils/pricing';

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onAdd: () => void;
  wishlisted?: boolean;
  onToggleWishlist?: () => void;
}

export function ProductCard({ product, onPress, onAdd, wishlisted, onToggleWishlist }: ProductCardProps) {
  const { theme } = useTheme();
  const imageUrls = useMemo(() => {
    const gallery = (product.images ?? []).map((item) => item.imageUrl).filter(Boolean);
    if (gallery.length) {
      return gallery;
    }
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product.imageUrl, product.images]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const outOfStock = product.stock <= 0;
  const displayPrice = getProductBasePrice(product);
  const hasDiscount = displayPrice < product.price;
  const shakeX = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const titleX = useRef(new Animated.Value(0)).current;
  const useNativeDriver = Platform.OS !== 'web';
  const shouldScrollTitle = product.name.length > 20;

  useEffect(() => {
    setActiveImageIndex(0);
  }, [product.id, imageUrls.length]);

  useEffect(() => {
    titleX.stopAnimation();
    titleX.setValue(0);
    if (!shouldScrollTitle) {
      return;
    }

    const distance = Math.min(110, Math.max(32, product.name.length * 4));
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(titleX, { toValue: -distance, duration: 4200, easing: Easing.linear, useNativeDriver }),
        Animated.delay(700),
        Animated.timing(titleX, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [product.id, product.name, shouldScrollTitle, titleX, useNativeDriver]);

  useEffect(() => {
    if (imageUrls.length <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setActiveImageIndex((prev) => (prev + 1) % imageUrls.length);
    }, 2800);

    return () => clearInterval(timer);
  }, [imageUrls.length]);

  const triggerAddFeedback = () => {
    Vibration.vibrate(12);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(shakeX, { toValue: -3, duration: 45, useNativeDriver }),
        Animated.timing(shakeX, { toValue: 3, duration: 45, useNativeDriver }),
        Animated.timing(shakeX, { toValue: -2, duration: 45, useNativeDriver }),
        Animated.timing(shakeX, { toValue: 0, duration: 45, useNativeDriver }),
      ]),
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.96, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver }),
        Animated.timing(pulse, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver }),
      ]),
    ]).start();
  };

  const handleAdd = () => {
    if (outOfStock) {
      return;
    }

    triggerAddFeedback();
    onAdd();
  };

  return (
    <Pressable
      style={[styles.card, { backgroundColor: theme.colors.card }, theme.shadow.card]}
      onPress={onPress}
    >
      <View style={styles.imageWrap}>
        {imageUrls.length ? (
          <Image source={{ uri: imageUrls[activeImageIndex] }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.fallbackImage, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Ionicons name="cart-outline" size={22} color={theme.colors.textMuted} />
          </View>
        )}
        {onToggleWishlist ? (
          <Pressable
            style={styles.wishlistBtn}
            onPress={(e) => { e.stopPropagation(); onToggleWishlist(); }}
          >
            <Ionicons
              name={wishlisted ? 'heart' : 'heart-outline'}
              size={16}
              color={wishlisted ? '#EF4444' : theme.colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.infoSection}>
        <View style={styles.nameClip}>
          <Animated.Text
            style={[styles.name, { color: theme.colors.text, transform: [{ translateX: titleX }] }]}
            numberOfLines={1}
          >
            {product.name}
          </Animated.Text>
        </View>

        <View style={[styles.titleDivider, { backgroundColor: theme.colors.border }]} />

        <Text style={[styles.description, { color: theme.colors.textMuted }]} numberOfLines={2}>
          {product.description?.trim() || product.categoryName}
        </Text>

        <View style={styles.stockRow}>
          <Text style={[styles.stockText, { color: outOfStock ? theme.colors.danger : theme.colors.success }]}>
            {outOfStock ? 'Out of stock' : `${product.stock} in stock`}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text style={[styles.price, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {formatPHP(displayPrice)}
          </Text>
          <Animated.View style={{ transform: [{ translateX: shakeX }, { scale: pulse }] }}>
            <Pressable
              style={[styles.addBtn, { backgroundColor: outOfStock ? theme.colors.surfaceAlt : theme.colors.primary }]}
              disabled={outOfStock}
              onPress={(e) => { e.stopPropagation(); handleAdd(); }}
            >
              <Ionicons name={outOfStock ? 'close-circle-outline' : 'cart'} size={13} color={outOfStock ? theme.colors.textMuted : '#fff'} />
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Pressable>
  );
}

const CARD_GAP = 6;

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  imageWrap: {
    aspectRatio: 1,
    overflow: 'hidden',
    width: '100%',
  },
  wishlistBtn: {
    alignItems: 'center',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 26,
    zIndex: 2,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  fallbackImage: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  infoSection: {
    paddingHorizontal: 9,
    paddingBottom: 10,
    paddingTop: 8,
  },
  nameClip: {
    height: 18,
    overflow: 'hidden',
    width: '100%',
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    minWidth: '140%',
  },
  titleDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 5,
    opacity: 0.75,
  },
  description: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 13,
    marginTop: 5,
    minHeight: 26,
  },
  stockRow: {
    marginTop: 4,
  },
  stockText: {
    fontSize: 10,
    fontWeight: '600',
  },
  bottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },
  addBtn: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
});
