import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { QuantityStepper } from './QuantityStepper';
import { useTheme } from '../providers/ThemeProvider';
import { Product, ProductVariant } from '../types/models';
import { formatPHP } from '../utils/currency';
import { getProductBasePrice } from '../utils/pricing';

interface VariantPickerModalProps {
  visible: boolean;
  product: Product | null;
  onSelect: (variant: ProductVariant, quantity: number) => void;
  onClose: () => void;
}

export function VariantPickerModal({ visible, product, onSelect, onClose }: VariantPickerModalProps) {
  const { theme } = useTheme();
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);

  if (!product) return null;

  const variants = product.variants?.filter((v) => v.isActive) ?? [];
  const imageUri = product.imageUrl || product.images?.[0]?.imageUrl;

  const getVariantPrice = (variant: ProductVariant) => {
    return getProductBasePrice(product) + variant.priceDelta;
  };

  const getVariantStock = (variant: ProductVariant) => {
    return variant.stockOverride ?? product.stock;
  };

  const handleConfirm = () => {
    if (!selectedVariant) return;
    onSelect(selectedVariant, quantity);
    setSelectedVariant(null);
    setQuantity(1);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.colors.card }]} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{product.name}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {/* Product image + base price */}
          <View style={styles.productRow}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.productImg} resizeMode="cover" />
            ) : (
              <View style={[styles.productImg, { backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="bag-outline" size={20} color={theme.colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.basePrice, { color: theme.colors.primary }]}>
                {formatPHP(getProductBasePrice(product))}
              </Text>
              <Text style={[styles.stockLabel, { color: theme.colors.textMuted }]}>
                {product.stock} in stock
              </Text>
            </View>
          </View>

          {/* Variant options */}
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Select variant:</Text>
          <View style={styles.variantGrid}>
            {variants.map((variant) => {
              const active = selectedVariant?.id === variant.id;
              const stock = getVariantStock(variant);
              const outOfStock = stock <= 0;
              return (
                <Pressable
                  key={variant.id}
                  style={[
                    styles.variantChip,
                    {
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: active ? `${theme.colors.primary}15` : theme.colors.surface,
                      opacity: outOfStock ? 0.4 : 1,
                    },
                  ]}
                  disabled={outOfStock}
                  onPress={() => { setSelectedVariant(variant); setQuantity(1); }}
                >
                  <Text style={[styles.variantName, { color: active ? theme.colors.primary : theme.colors.text }]}>
                    {variant.value}
                  </Text>
                  <Text style={[styles.variantPrice, { color: theme.colors.textMuted }]}>
                    {formatPHP(getVariantPrice(variant))}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Quantity stepper */}
          {selectedVariant && (
            <View style={styles.qtyRow}>
              <Text style={[styles.qtyLabel, { color: theme.colors.textMuted }]}>Quantity:</Text>
              <QuantityStepper
                value={quantity}
                min={1}
                max={getVariantStock(selectedVariant)}
                onChange={setQuantity}
              />
            </View>
          )}

          {/* Confirm button */}
          <Pressable
            style={[
              styles.confirmBtn,
              {
                backgroundColor: selectedVariant ? theme.colors.primary : theme.colors.surfaceAlt,
              },
            ]}
            disabled={!selectedVariant}
            onPress={handleConfirm}
          >
            <Text style={[styles.confirmText, { color: selectedVariant ? '#fff' : theme.colors.textMuted }]}>
              {selectedVariant
                ? `Add to Cart — ${formatPHP(getVariantPrice(selectedVariant) * quantity)}`
                : 'Select a variant'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 16,
    maxHeight: '80%',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  productRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  productImg: {
    borderRadius: 10,
    height: 60,
    width: 60,
  },
  basePrice: {
    fontSize: 16,
    fontWeight: '700',
  },
  stockLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  variantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  variantChip: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  variantName: {
    fontSize: 13,
    fontWeight: '600',
  },
  variantPrice: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  qtyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  qtyLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  qtyStepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  qtyBtn: {
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  qtyValue: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  confirmBtn: {
    borderRadius: 999,
    paddingVertical: 13,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
