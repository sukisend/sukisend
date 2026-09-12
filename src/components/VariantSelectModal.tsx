import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from './ModalBackdrop';
import { QuantityStepper } from './QuantityStepper';
import { useTheme } from '../providers/ThemeProvider';
import { Product, ProductVariant } from '../types/models';
import { formatPHP } from '../utils/currency';
import { getVariantUnitPrice } from '../utils/pricing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const THUMB = 90;

interface VariantSelectModalProps {
  visible: boolean;
  product: Product;
  selectedVariantId: string | null;
  quantity: number;
  onClose: () => void;
  onConfirm: (variantId: string | null, quantity: number) => void;
}

export function VariantSelectModal({ visible, product, selectedVariantId, quantity: initialQty, onClose, onConfirm }: VariantSelectModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [pickedVariantId, setPickedVariantId] = useState<string | null>(selectedVariantId);
  const [qty, setQty] = useState(initialQty);

  useEffect(() => {
    if (visible) {
      const active = (product.variants ?? []).filter((v) => v.isActive);
      if (active.length > 0) {
        setPickedVariantId(selectedVariantId ?? active[0].id);
      } else {
        setPickedVariantId(selectedVariantId);
      }
      setQty(initialQty);
    }
  }, [visible, selectedVariantId, initialQty, product.variants]);

  const activeVariants = (product.variants ?? []).filter((v) => v.isActive);
  const pickedVariant = activeVariants.find((v) => v.id === pickedVariantId);
  const effectivePrice = getVariantUnitPrice(product, pickedVariant);
  const stock = pickedVariant?.stockOverride ?? product.stock;
  const outOfStock = stock <= 0;
  const totalImages = product.images?.length ?? (product.imageUrl ? 1 : 0);
  const displayImageUrl = pickedVariant?.imageUrl || product.images?.[0]?.imageUrl || product.imageUrl;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalBackdrop align="center" overlayOpacity={0.45}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.card, paddingBottom: insets.bottom + 12 }]}>
          {/* Close button */}
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={20} color={theme.colors.textMuted} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
            {/* Top: Image + Price + Stock */}
            <View style={styles.topRow}>
              {displayImageUrl ? (
                <Image source={{ uri: displayImageUrl }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="cube-outline" size={28} color={theme.colors.textMuted} />
                </View>
              )}
              <View style={styles.topInfo}>
                <Text style={[styles.sheetPrice, { color: theme.colors.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {formatPHP(effectivePrice)}
                </Text>
                <Text style={[styles.sheetStock, { color: theme.colors.textMuted }]}>
                  Stock: {outOfStock ? 'Out of stock' : stock}
                </Text>
                {pickedVariant && (
                  <Text style={[styles.sheetPicked, { color: theme.colors.text }]}>
                    {pickedVariant.name}: {pickedVariant.value}
                  </Text>
                )}
                {totalImages > 1 && (
                  <Text style={[styles.sheetImgCount, { color: theme.colors.textMuted }]}>
                    {totalImages} images
                  </Text>
                )}
              </View>
            </View>

            {/* Variant selector */}
            {activeVariants.length > 0 && (
              <View style={styles.variantSection}>
                <Text style={[styles.variantSectionTitle, { color: theme.colors.text }]}>Select Variant</Text>
                <View style={styles.variantGrid}>
                  {activeVariants.map((variant) => {
                    const active = variant.id === pickedVariantId;
                    const variantStock = variant.stockOverride ?? product.stock;
                    const disabled = variantStock <= 0;
                    return (
                      <Pressable
                        key={variant.id}
                        style={[
                          styles.variantChip,
                          {
                            borderColor: active ? theme.colors.primary : theme.colors.border,
                            backgroundColor: active ? theme.colors.primary + '10' : theme.colors.surface,
                            opacity: disabled ? 0.45 : 1,
                          },
                        ]}
                        disabled={disabled}
                        onPress={() => setPickedVariantId(active ? null : variant.id)}
                      >
                        {variant.imageUrl ? (
                          <Image source={{ uri: variant.imageUrl }} style={styles.variantChipImg} />
                        ) : null}
                        <Text style={[styles.variantName, { color: active ? theme.colors.primary : theme.colors.text }]} numberOfLines={1}>
                          {variant.name}: {variant.value}
                        </Text>
                        <Text style={[styles.variantPrice, { color: active ? theme.colors.primary : theme.colors.textMuted }]}>
                          {formatPHP(getVariantUnitPrice(product, variant))}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Quantity */}
            <View style={styles.qtyRow}>
              <Text style={[styles.qtyLabel, { color: theme.colors.text }]}>Quantity</Text>
              <QuantityStepper value={qty} min={1} max={stock} onChange={setQty} />
            </View>
          </ScrollView>

          {/* Confirm button */}
          <Pressable
            style={[styles.confirmBtn, { backgroundColor: outOfStock ? theme.colors.surfaceAlt : theme.colors.primary }]}
            disabled={outOfStock}
            onPress={() => {
              onConfirm(pickedVariantId, qty);
              onClose();
            }}
          >
            <Text style={[styles.confirmText, { color: outOfStock ? theme.colors.textMuted : '#fff' }]}>
              {outOfStock ? 'Out of Stock' : 'Confirm'}
            </Text>
          </Pressable>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderRadius: 20,
    maxHeight: '70%',
    marginHorizontal: 20,
    width: '100%',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  /* Top row */
  topRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  thumb: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: THUMB,
    width: THUMB,
  },
  topInfo: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minWidth: 0,
  },
  sheetPrice: {
    fontSize: 22,
    fontWeight: '800',
  },
  sheetStock: {
    fontSize: 12,
    fontWeight: '500',
  },
  sheetPicked: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  sheetImgCount: {
    fontSize: 11,
    fontWeight: '500',
  },

  /* Variants */
  variantSection: {
    marginBottom: 16,
  },
  variantSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  variantGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  variantChip: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 90,
  },
  variantChipImg: {
    borderRadius: 6,
    height: 32,
    width: 32,
  },
  variantName: {
    fontSize: 12,
    fontWeight: '600',
  },
  variantPrice: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },

  /* Quantity */
  qtyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  qtyControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  qtyBtn: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  qtyValue: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'center',
  },

  /* Confirm */
  confirmBtn: {
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
