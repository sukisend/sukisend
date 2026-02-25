import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../providers/ThemeProvider';
import { useCartStore } from '../../store/cartStore';
import { CustomerStackParamList } from '../../navigation/types';
import { formatPHP } from '../../utils/currency';

const DELIVERY_FEE = 35;

export function CartScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const items = useCartStore((state) => state.items);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const subtotal = useCartStore((state) => state.subtotal());
  const total = subtotal + (items.length ? DELIVERY_FEE : 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 22, paddingTop: insets.top + 10 }]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>My Cart</Text>

      {!items.length ? (
        <EmptyState title="Your cart is empty" subtitle="Add products first before checkout." />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <View
              key={`${item.product.id}-${item.variantId ?? 'default'}`}
              style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={2}>
                  {item.product.name}
                </Text>
                <Pressable onPress={() => removeItem(item.product.id, item.variantId)}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                </Pressable>
              </View>
              <Text style={[styles.itemMeta, { color: theme.colors.textMuted }]}>
                {item.product.unit}
                {item.variantLabel ? ` | ${item.variantLabel}` : ''} | {formatPHP(item.unitPrice ?? item.product.price)}
              </Text>

              <View style={styles.qtyRow}>
                <Pressable
                  style={[styles.qtyButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                  onPress={() => setQuantity(item.product.id, item.quantity - 1, item.variantId)}
                >
                  <Text style={[styles.qtyButtonText, { color: theme.colors.text }]}>-</Text>
                </Pressable>
                <Text style={[styles.qtyValue, { color: theme.colors.text }]}>{item.quantity}</Text>
                <Pressable
                  style={[styles.qtyButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                  onPress={() => setQuantity(item.product.id, item.quantity + 1, item.variantId)}
                >
                  <Text style={[styles.qtyButtonText, { color: theme.colors.text }]}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.summaryCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Subtotal</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatPHP(subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>Delivery Fee</Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{formatPHP(items.length ? DELIVERY_FEE : 0)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryTotal]}>
          <Text style={[styles.summaryLabel, { color: theme.colors.text }]}>Total</Text>
          <Text style={[styles.summaryTotalValue, { color: theme.colors.primary }]}>{formatPHP(total)}</Text>
        </View>
      </View>

      <Pressable
        disabled={!items.length}
        style={[
          styles.primaryButton,
          {
            backgroundColor: items.length ? theme.colors.primary : theme.colors.surfaceAlt,
          },
        ]}
        onPress={() => navigation.navigate('Checkout')}
      >
        <Text style={[styles.primaryButtonText, { color: items.length ? theme.colors.primaryContrast : theme.colors.textMuted }]}>
          Proceed to Checkout
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
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  list: {
    gap: 10,
    marginTop: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingRight: 12,
  },
  itemMeta: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  qtyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
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
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  qtyValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginTop: 14,
    padding: 14,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  summaryTotal: {
    marginTop: 6,
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  primaryButton: {
    borderRadius: 999,
    marginTop: 14,
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
