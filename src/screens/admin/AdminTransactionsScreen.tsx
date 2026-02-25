import dayjs from 'dayjs';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DateRangePicker } from '../../components/DateRangePicker';
import { EmptyState } from '../../components/EmptyState';
import { RangeChips } from '../../components/RangeChips';
import { SectionHeader } from '../../components/SectionHeader';
import { useTheme } from '../../providers/ThemeProvider';
import {
  fetchOpenRefundRequests,
  fetchRecentTransactions,
  fetchShippingMethodsAdmin,
  resolveRefund,
  saveShippingMethod,
  updateOrderStatus,
} from '../../services/adminService';
import { DateRange, Order, OrderStatus, SalesRangePreset, ShippingMethod } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';

const NEXT_ACTIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['approved', 'cancelled'],
  approved: ['preparing', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['completed'],
  refund_requested: ['refunded', 'completed'],
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  refund_requested: 'Refund Requested',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

interface ShippingForm {
  name: string;
  description: string;
  baseFee: string;
  etaMinDays: string;
  etaMaxDays: string;
}

const EMPTY_SHIPPING_FORM: ShippingForm = {
  name: '',
  description: '',
  baseFee: '',
  etaMinDays: '',
  etaMaxDays: '',
};

export function AdminTransactionsScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const [rangePreset, setRangePreset] = useState<SalesRangePreset>('month');
  const [customRange, setCustomRange] = useState({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD'),
  });
  const [transactions, setTransactions] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingForm, setShippingForm] = useState<ShippingForm>(EMPTY_SHIPPING_FORM);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, { lat: string; lng: string }>>({});
  const [loading, setLoading] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);

  const rangeIso: DateRange = useMemo(
    () => ({
      start: dayjs(customRange.start, 'YYYY-MM-DD').startOf('day').toISOString(),
      end: dayjs(customRange.end, 'YYYY-MM-DD').endOf('day').toISOString(),
    }),
    [customRange],
  );

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const [rows, shipping, openRefunds] = await Promise.all([
        fetchRecentTransactions(50, rangePreset, rangePreset === 'custom' ? rangeIso : undefined),
        fetchShippingMethodsAdmin(),
        fetchOpenRefundRequests(),
      ]);
      setTransactions(rows);
      setShippingMethods(shipping);
      setRefunds(openRefunds);
    } catch {
      setTransactions([]);
      setShippingMethods([]);
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [rangePreset, rangeIso.start, rangeIso.end]);

  const handleStatusUpdate = async (order: Order, nextStatus: OrderStatus) => {
    try {
      const latValue = trackingInputs[order.id]?.lat;
      const lngValue = trackingInputs[order.id]?.lng;
      const lat = latValue ? Number(latValue) : undefined;
      const lng = lngValue ? Number(lngValue) : undefined;

      await updateOrderStatus(
        order.id,
        nextStatus,
        undefined,
        Number.isFinite(lat) ? lat : undefined,
        Number.isFinite(lng) ? lng : undefined,
      );
      await loadTransactions();
    } catch {
      // Keep UX simple and avoid blocking list.
    }
  };

  const submitShippingMethod = async () => {
    const baseFee = Number(shippingForm.baseFee);
    if (!shippingForm.name.trim() || !Number.isFinite(baseFee)) {
      return;
    }

    setSavingShipping(true);
    try {
      await saveShippingMethod({
        name: shippingForm.name.trim(),
        description: shippingForm.description.trim() || undefined,
        baseFee,
        etaMinDays: shippingForm.etaMinDays ? Number(shippingForm.etaMinDays) : undefined,
        etaMaxDays: shippingForm.etaMaxDays ? Number(shippingForm.etaMaxDays) : undefined,
        isActive: true,
      });
      setShippingForm(EMPTY_SHIPPING_FORM);
      await loadTransactions();
    } finally {
      setSavingShipping(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 22 }]}
    >
      <SectionHeader title="Orders, Shipping, and Refunds" subtitle="Approve COD orders and manage delivery workflow." />

      <RangeChips value={rangePreset} onChange={setRangePreset} />

      {rangePreset === 'custom' ? (
        <DateRangePicker startDate={customRange.start} endDate={customRange.end} onChange={setCustomRange} />
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Shipping Methods</Text>
        {shippingMethods.map((method) => (
          <Text key={method.id} style={[styles.meta, { color: theme.colors.textMuted }]}>
            {method.name} - {formatPHP(method.baseFee)} {method.isActive ? '' : '(Inactive)'}
          </Text>
        ))}

        <TextInput
          value={shippingForm.name}
          onChangeText={(value) => setShippingForm((prev) => ({ ...prev, name: value }))}
          placeholder="Courier name (e.g. J&T)"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <TextInput
          value={shippingForm.description}
          onChangeText={(value) => setShippingForm((prev) => ({ ...prev, description: value }))}
          placeholder="Description"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <View style={styles.row}>
          <TextInput
            value={shippingForm.baseFee}
            onChangeText={(value) => setShippingForm((prev) => ({ ...prev, baseFee: value }))}
            placeholder="Fee"
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.halfInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <TextInput
            value={shippingForm.etaMinDays}
            onChangeText={(value) => setShippingForm((prev) => ({ ...prev, etaMinDays: value }))}
            placeholder="ETA Min Day"
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.halfInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <TextInput
            value={shippingForm.etaMaxDays}
            onChangeText={(value) => setShippingForm((prev) => ({ ...prev, etaMaxDays: value }))}
            placeholder="ETA Max Day"
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.halfInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>
        <Pressable
          style={[styles.primaryButton, { backgroundColor: savingShipping ? theme.colors.surfaceAlt : theme.colors.primary }]}
          onPress={submitShippingMethod}
        >
          <Text style={[styles.primaryButtonText, { color: savingShipping ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
            {savingShipping ? 'Saving...' : 'Add Shipping Method'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Refund Queue</Text>
        {refunds.length ? (
          refunds.map((refund) => (
            <View key={refund.id} style={[styles.refundCard, { borderColor: theme.colors.border }]}>
              <Text style={[styles.meta, { color: theme.colors.text }]}>Order: {refund.order_id}</Text>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Reason: {refund.reason}</Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                  onPress={async () => {
                    await resolveRefund(refund.id, false);
                    await loadTransactions();
                  }}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Reject</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                  onPress={async () => {
                    await resolveRefund(refund.id, true);
                    await loadTransactions();
                  }}
                >
                  <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Approve</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>No open refund requests.</Text>
        )}
      </View>

      {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading transactions...</Text> : null}
      {!loading && !transactions.length ? (
        <EmptyState title="No transactions found" subtitle="Try a different date range." />
      ) : null}

      <View style={styles.list}>
        {transactions.map((order) => (
          <View key={order.id} style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.row}>
              <Text style={[styles.orderNo, { color: theme.colors.text }]}>{order.orderNo}</Text>
              <Text style={[styles.status, { color: theme.colors.primary }]}>{STATUS_LABEL[order.status]}</Text>
            </View>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatDateTime(order.createdAt)}</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Shipping: {order.shippingMethodName || 'N/A'}</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Address: {order.deliveryAddress}</Text>
            <View style={styles.row}>
              <TextInput
                value={trackingInputs[order.id]?.lat ?? ''}
                onChangeText={(value) =>
                  setTrackingInputs((prev) => ({
                    ...prev,
                    [order.id]: {
                      lat: value,
                      lng: prev[order.id]?.lng ?? '',
                    },
                  }))
                }
                placeholder="Lat (optional)"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                style={[styles.input, styles.halfInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
              <TextInput
                value={trackingInputs[order.id]?.lng ?? ''}
                onChangeText={(value) =>
                  setTrackingInputs((prev) => ({
                    ...prev,
                    [order.id]: {
                      lat: prev[order.id]?.lat ?? '',
                      lng: value,
                    },
                  }))
                }
                placeholder="Lng (optional)"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                style={[styles.input, styles.halfInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
            </View>

            <View style={styles.itemsWrap}>
              {order.items.map((item) => (
                <Text key={item.id} style={[styles.itemText, { color: theme.colors.text }]}>
                  {item.productName}
                  {item.variantValue ? ` (${item.variantValue})` : ''} x{item.quantity} = {formatPHP(item.lineTotal)}
                </Text>
              ))}
            </View>

            <View style={styles.row}>
              <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>COD Total</Text>
              <Text style={[styles.totalValue, { color: theme.colors.primary }]}>{formatPHP(order.total)}</Text>
            </View>

            <View style={styles.actionRow}>
              {(NEXT_ACTIONS[order.status] ?? []).map((next) => (
                <Pressable
                  key={`${order.id}-${next}`}
                  style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                  onPress={() => handleStatusUpdate(order, next)}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                    {next === 'out_for_delivery' ? 'Out for Delivery' : STATUS_LABEL[next]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 10,
    padding: 14,
  },
  helper: {
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    gap: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderNo: {
    fontSize: 15,
    fontWeight: '800',
  },
  status: {
    fontSize: 12,
    fontWeight: '800',
  },
  meta: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  itemsWrap: {
    marginTop: 8,
    rowGap: 2,
  },
  itemText: {
    fontSize: 12,
    fontWeight: '600',
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  totalValue: {
    fontSize: 17,
    fontWeight: '900',
    marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  halfInput: {
    flex: 1,
  },
  refundCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
});
