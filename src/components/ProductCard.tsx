import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';
import { Product } from '../types/models';
import { formatPHP } from '../utils/currency';

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
      {onToggleWishlist ? (
        <Pressable style={styles.wishlistButton} onPress={onToggleWishlist}>
          <Ionicons
            name={wishlisted ? 'heart' : 'heart-outline'}
            size={18}
            color={wishlisted ? theme.colors.primary : theme.colors.textMuted}
          />
        </Pressable>
      ) : null}

      <View style={styles.imageWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.fallbackImage, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Ionicons name="basket-outline" size={26} color={theme.colors.textMuted} />
          </View>
        )}
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
        <Text style={[styles.price, { color: theme.colors.primary }]}>{formatPHP(product.price)}</Text>
        <Pressable
          style={[
            styles.addButton,
            {
              backgroundColor: outOfStock ? theme.colors.surfaceAlt : theme.colors.primary,
            },
          ]}
          disabled={outOfStock}
          onPress={onAdd}
        >
          <Ionicons
            name={outOfStock ? 'close-circle-outline' : 'add'}
            size={18}
            color={outOfStock ? theme.colors.textMuted : theme.colors.primaryContrast}
          />
          <Text style={[styles.addButtonText, { color: outOfStock ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
            {outOfStock ? 'Out' : 'Add'}
          </Text>
        </Pressable>
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
    width: '48%',
  },
  wishlistButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 10,
    padding: 4,
  },
  imageWrap: {
    alignItems: 'center',
    height: 98,
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
