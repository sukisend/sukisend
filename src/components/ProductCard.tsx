import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

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
  const outOfStock = product.stock <= 0;
  const displayPrice = getProductBasePrice(product);
  const hasDiscount = displayPrice < product.price;
  const shakeX = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const triggerAddFeedback = () => {
    Vibration.vibrate(12);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(shakeX, { toValue: -3, duration: 45, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 3, duration: 45, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: -2, duration: 45, useNativeDriver: true }),
        Animated.timing(shakeX, { toValue: 0, duration: 45, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.96, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
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
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.imageWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.fallbackImage, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Ionicons name="basket-outline" size={26} color={theme.colors.textMuted} />
          </View>
        )}

        {onToggleWishlist ? (
          <Pressable
            style={[styles.wishlistButton, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            onPress={(event) => {
              event.stopPropagation();
              onToggleWishlist();
            }}
          >
            <Ionicons
              name={wishlisted ? 'heart' : 'heart-outline'}
              size={16}
              color={wishlisted ? theme.colors.primary : theme.colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={[styles.category, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {product.categoryName}
      </Text>

      <Text style={[styles.stockText, { color: outOfStock ? theme.colors.danger ?? '#EF4444' : theme.colors.textMuted }]}>
        {outOfStock ? 'Out of stock' : `${product.stock} in stock`}
      </Text>

      <View style={styles.bottomRow}>
        <View>
          <Text style={[styles.price, { color: theme.colors.primary }]}>{formatPHP(displayPrice)}</Text>
          {hasDiscount ? (
            <Text style={[styles.oldPrice, { color: theme.colors.textMuted }]}>{formatPHP(product.price)}</Text>
          ) : null}
        </View>
        <Animated.View style={{ transform: [{ translateX: shakeX }, { scale: pulse }] }}>
          <Pressable
          style={[
            styles.addButton,
            {
              backgroundColor: outOfStock ? theme.colors.surfaceAlt : theme.colors.primary,
            },
          ]}
          disabled={outOfStock}
          onPress={(event) => {
            event.stopPropagation();
            handleAdd();
          }}
        >
          <Ionicons
            name={outOfStock ? 'close-circle-outline' : 'basket-outline'}
            size={18}
            color={outOfStock ? theme.colors.textMuted : theme.colors.primaryContrast}
          />
          <Text style={[styles.addButtonText, { color: outOfStock ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
            {outOfStock ? 'Out' : 'Add'}
          </Text>
        </Pressable>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    minHeight: 240,
    overflow: 'hidden',
    padding: 12,
    width: '48.5%',
  },
  wishlistButton: {
    position: 'absolute',
    right: 6,
    top: 6,
    zIndex: 10,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    padding: 0,
    width: 26,
  },
  imageWrap: {
    alignItems: 'center',
    height: 108,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  image: {
    borderRadius: 10,
    height: '100%',
    width: '100%',
  },
  fallbackImage: {
    alignItems: 'center',
    borderRadius: 10,
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    minHeight: 36,
  },
  category: {
    fontSize: 11,
    fontWeight: '500',
  },
  stockText: {
    fontSize: 11,
    fontWeight: '600',
  },
  bottomRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
  },
  oldPrice: {
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
