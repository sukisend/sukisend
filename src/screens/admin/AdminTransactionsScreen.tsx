import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';

import { DateRangePicker } from '../../components/DateRangePicker';
import { EmptyState } from '../../components/EmptyState';
import { RangeChips } from '../../components/RangeChips';
import { SectionHeader } from '../../components/SectionHeader';
import { useTheme } from '../../providers/ThemeProvider';
import {
  deleteShippingMethod,
  fetchOpenRefundRequests,
  fetchRecentTransactions,
  fetchShippingMethodsAdmin,
  resolveRefund,
  saveShippingMethod,
  updateOrderStatus,
} from '../../services/adminService';
import { fetchDeliveryRatePerKmSetting, saveDeliveryRatePerKmSetting } from '../../services/settingsService';
import { DateRange, Order, OrderStatus, SalesRangePreset, ShippingMethod } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';

const NEXT_ACTIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['approved', 'cancelled'],
  approved: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['completed'],
  refund_requested: ['refunded', 'completed'],
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  confirmed: 'Approved',
  preparing: 'Approved',
  packed: 'Approved',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  refund_requested: 'Refund Requested',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

function normalizeOrderStatus(status: OrderStatus): OrderStatus {
  if (status === 'confirmed' || status === 'preparing' || status === 'packed') {
    return 'approved';
  }

  return status;
}

const STATUS_SECTIONS: Array<{ status: OrderStatus; title: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { status: 'pending', title: 'Order Placed', icon: 'time-outline' },
  { status: 'approved', title: 'Approved', icon: 'checkmark-done-outline' },
  { status: 'shipped', title: 'Shipped', icon: 'car-outline' },
  { status: 'out_for_delivery', title: 'Out for Delivery', icon: 'navigate-outline' },
  { status: 'delivered', title: 'Delivered', icon: 'checkmark-circle-outline' },
  { status: 'completed', title: 'Completed', icon: 'trophy-outline' },
  { status: 'cancelled', title: 'Cancelled', icon: 'close-circle-outline' },
  { status: 'refund_requested', title: 'Refund Requested', icon: 'alert-circle-outline' },
  { status: 'refunded', title: 'Refunded', icon: 'return-down-back-outline' },
];

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
  const { theme } = useTheme();
  const [rangePreset, setRangePreset] = useState<SalesRangePreset>('today');
  const [customRange, setCustomRange] = useState({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD'),
  });
  const [transactions, setTransactions] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingForm, setShippingForm] = useState<ShippingForm>(EMPTY_SHIPPING_FORM);
  const [deliveryRateInput, setDeliveryRateInput] = useState('20');
  const [deliveryRateMessage, setDeliveryRateMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);
  const [savingDeliveryRate, setSavingDeliveryRate] = useState(false);
  const [expandedSection, setExpandedSection] = useState<OrderStatus | null>('pending');
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [liveTrackingOrderId, setLiveTrackingOrderId] = useState<string | null>(null);
  const liveTrackingSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

  const rangeIso: DateRange = useMemo(
    () => ({
      start: dayjs(customRange.start, 'YYYY-MM-DD').startOf('day').toISOString(),
      end: dayjs(customRange.end, 'YYYY-MM-DD').endOf('day').toISOString(),
    }),
    [customRange],
  );

  const ordersByStatus = useMemo(() => {
    const grouped: Record<OrderStatus, Order[]> = {
      pending: [],
      approved: [],
      confirmed: [],
      preparing: [],
      packed: [],
      shipped: [],
      out_for_delivery: [],
      delivered: [],
      completed: [],
      refund_requested: [],
      refunded: [],
      cancelled: [],
    };

    for (const order of transactions) {
      const normalizedStatus = normalizeOrderStatus(order.status);
      grouped[normalizedStatus].push(order);
    }

    return grouped;
  }, [transactions]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const [rows, shipping, openRefunds, deliveryRate] = await Promise.all([
        fetchRecentTransactions(80, rangePreset, rangePreset === 'custom' ? rangeIso : undefined),
        fetchShippingMethodsAdmin(),
        fetchOpenRefundRequests(),
        fetchDeliveryRatePerKmSetting(),
      ]);
      setTransactions(rows);
      setShippingMethods(shipping);
      setRefunds(openRefunds);
      setDeliveryRateInput(String(deliveryRate));
      setDeliveryRateMessage('');
    } catch {
      setTransactions([]);
      setShippingMethods([]);
      setRefunds([]);
      setDeliveryRateMessage('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [rangePreset, rangeIso.start, rangeIso.end]);

  useEffect(() => {
    return () => {
      liveTrackingSubscriptionRef.current?.remove();
      liveTrackingSubscriptionRef.current = null;
    };
  }, []);

  const getCurrentCoordinates = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return null;
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: Number(current.coords.latitude.toFixed(7)),
      longitude: Number(current.coords.longitude.toFixed(7)),
    };
  };

  const handleStatusUpdate = async (order: Order, nextStatus: OrderStatus) => {
    const note = (statusNotes[order.id] ?? '').trim() || `Order is now ${STATUS_LABEL[nextStatus].toLowerCase()}.`;

    try {
      const nextNormalized = normalizeOrderStatus(nextStatus);
      const coords =
        nextNormalized === 'shipped' || nextNormalized === 'out_for_delivery' || nextNormalized === 'delivered'
          ? await getCurrentCoordinates()
          : null;

      await updateOrderStatus(order.id, nextStatus, note || undefined, coords?.latitude, coords?.longitude);
      setStatusNotes((prev) => ({ ...prev, [order.id]: '' }));
      await loadTransactions();
    } catch {
      // keep current UI state
    }
  };

  const stopLiveTracking = () => {
    liveTrackingSubscriptionRef.current?.remove();
    liveTrackingSubscriptionRef.current = null;
    setLiveTrackingOrderId(null);
  };

  const startLiveTracking = async (order: Order) => {
    if (liveTrackingOrderId === order.id) {
      stopLiveTracking();
      return;
    }

    stopLiveTracking();
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const normalizedStatus = normalizeOrderStatus(order.status);
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 15,
        timeInterval: 6000,
      },
      async (position: Location.LocationObject) => {
        const lat = Number(position.coords.latitude.toFixed(7));
        const lng = Number(position.coords.longitude.toFixed(7));
        try {
          await updateOrderStatus(
            order.id,
            normalizedStatus,
            'Live rider location update',
            lat,
            lng,
          );
        } catch {
          // Keep live tracking active even when single update fails.
        }
      },
    );

    liveTrackingSubscriptionRef.current = subscription;
    setLiveTrackingOrderId(order.id);
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

  const submitDeliveryRate = async () => {
    const rate = Number(deliveryRateInput);
    if (!Number.isFinite(rate) || rate <= 0) {
      setDeliveryRateMessage('Rate must be greater than zero.');
      return;
    }

    setSavingDeliveryRate(true);
    try {
      await saveDeliveryRatePerKmSetting(rate);
      setDeliveryRateMessage(`Saved ${formatPHP(rate)}/km`);
      await loadTransactions();
    } catch (error) {
      setDeliveryRateMessage(error instanceof Error ? error.message : 'Unable to save delivery rate.');
    } finally {
      setSavingDeliveryRate(false);
    }
  };

  const toggleSection = (section: OrderStatus) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const getSectionColor = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
      case 'approved':
      case 'shipped':
      case 'out_for_delivery':
        return theme.colors.primary;
      case 'delivered':
      case 'completed':
        return theme.colors.success;
      case 'cancelled':
        return theme.colors.danger ?? '#EF4444';
      case 'refund_requested':
      case 'refunded':
        return theme.colors.warning ?? '#F59E0B';
      default:
        return theme.colors.primary;
    }
  };

  const renderCompactOrder = (order: Order) => {
    const displayStatus = normalizeOrderStatus(order.status);
    const actions = NEXT_ACTIONS[displayStatus] ?? [];

    return (
      <View key={order.id} style={[styles.orderRow, { borderColor: theme.colors.border }]}>
        <View style={styles.orderHead}>
          <Text style={[styles.orderNo, { color: theme.colors.text }]}>{order.orderNo}</Text>
          <Text style={[styles.statusBadge, { color: theme.colors.primary }]}>{STATUS_LABEL[displayStatus]}</Text>
        </View>

        <View style={styles.orderMeta}>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatDateTime(order.createdAt)}</Text>
          <Text style={[styles.orderTotal, { color: theme.colors.primary }]}>{formatPHP(order.total)}</Text>
        </View>

        <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
        </Text>

        {order.deliveryAddress ? (
          <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
            Location: {order.deliveryAddress}
          </Text>
        ) : null}

        <TextInput
          value={statusNotes[order.id] ?? ''}
          onChangeText={(value) => setStatusNotes((prev) => ({ ...prev, [order.id]: value }))}
          placeholder="Progress note (visible to customer)"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.noteInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        {actions.length ? (
          <View style={styles.actionRow}>
            {actions.map((next) => (
              <Pressable
                key={next}
                style={[styles.actionBtn, { borderColor: theme.colors.border }]}
                onPress={() => handleStatusUpdate(order, next)}
              >
                <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>{STATUS_LABEL[next]}</Text>
              </Pressable>
            ))}
            {['approved', 'shipped', 'out_for_delivery'].includes(displayStatus) ? (
              <Pressable
                style={[styles.actionBtn, { borderColor: theme.colors.border, backgroundColor: liveTrackingOrderId === order.id ? theme.colors.primary : theme.colors.surface }]}
                onPress={() => startLiveTracking(order)}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: liveTrackingOrderId === order.id ? theme.colors.primaryContrast : theme.colors.text },
                  ]}
                >
                  {liveTrackingOrderId === order.id ? 'Stop Live GPS' : 'Start Live GPS'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderSectionHeader = (status: OrderStatus, title: string, icon: keyof typeof Ionicons.glyphMap, count: number) => {
    const color = getSectionColor(status);
    const isExpanded = expandedSection === status;

    return (
      <Pressable
        style={[styles.sectionHeader, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
        onPress={() => toggleSection(status)}
      >
        <View style={styles.sectionHeaderLeft}>
          <Ionicons name={icon} size={18} color={color} />
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeText}>{count}</Text>
          </View>
        </View>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: 8 }]}
    >
      <SectionHeader title="Transactions" subtitle="Manage orders, shipping, and refunds." />

      <RangeChips value={rangePreset} onChange={setRangePreset} />
      {rangePreset === 'custom' ? (
        <DateRangePicker startDate={customRange.start} endDate={customRange.end} onChange={setCustomRange} />
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Shipping Methods</Text>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Distance fee rate (per km)</Text>
        <View style={styles.row}>
          <TextInput
            value={deliveryRateInput}
            onChangeText={setDeliveryRateInput}
            placeholder="20"
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              styles.feeInput,
              { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
            ]}
          />
          <Pressable
            style={[styles.applyRateBtn, { backgroundColor: savingDeliveryRate ? theme.colors.surfaceAlt : theme.colors.primary }]}
            onPress={submitDeliveryRate}
          >
            <Text style={[styles.applyRateText, { color: theme.colors.primaryContrast }]}>
              {savingDeliveryRate ? 'Saving...' : 'Apply Rate'}
            </Text>
          </Pressable>
        </View>
        {deliveryRateMessage ? <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{deliveryRateMessage}</Text> : null}

        {shippingMethods.map((method) => (
          <View key={method.id} style={[styles.shipRow, { borderColor: theme.colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.shipName, { color: theme.colors.text }]}>{method.name}</Text>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                {formatPHP(method.baseFee)}
                {method.isActive ? '' : ' (Inactive)'}
              </Text>
            </View>

            <Pressable
              onPress={async () => {
                try {
                  await deleteShippingMethod(method.id);
                  await loadTransactions();
                } catch {
                  // keep current UI state
                }
              }}
              style={styles.delShipBtn}
            >
              <Ionicons name="trash-outline" size={14} color={theme.colors.danger ?? '#EF4444'} />
            </Pressable>
          </View>
        ))}

        <View style={styles.row}>
          <TextInput
            value={shippingForm.name}
            onChangeText={(value) => setShippingForm((prev) => ({ ...prev, name: value }))}
            placeholder="Name"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              styles.flex1,
              { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
            ]}
          />
          <TextInput
            value={shippingForm.baseFee}
            onChangeText={(value) => setShippingForm((prev) => ({ ...prev, baseFee: value }))}
            placeholder="Fee"
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.feeInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <Pressable
            style={[styles.addShipBtn, { backgroundColor: savingShipping ? theme.colors.surfaceAlt : theme.colors.primary }]}
            onPress={submitShippingMethod}
          >
            <Ionicons name="add" size={18} color={theme.colors.primaryContrast} />
          </Pressable>
        </View>
      </View>

      {refunds.length > 0 ? (
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Refund Queue ({refunds.length})</Text>
          {refunds.map((request) => (
            <View key={request.id} style={[styles.refundRow, { borderColor: theme.colors.border }]}>
              <Text style={[styles.meta, { color: theme.colors.text }]}>Order: {request.order_id}</Text>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{request.reason}</Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, { borderColor: theme.colors.border }]}
                  onPress={async () => {
                    await resolveRefund(request.id, false);
                    await loadTransactions();
                  }}
                >
                  <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Reject</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                  onPress={async () => {
                    await resolveRefund(request.id, true);
                    await loadTransactions();
                  }}
                >
                  <Text style={[styles.actionBtnText, { color: theme.colors.primaryContrast }]}>Approve</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading...</Text> : null}
      {!loading && !transactions.length ? <EmptyState title="No transactions" subtitle="Try a different date range." /> : null}

      {STATUS_SECTIONS.map((section) => {
        const orders = ordersByStatus[section.status] ?? [];
        return (
          <View key={section.status}>
            {renderSectionHeader(section.status, section.title, section.icon, orders.length)}
            {expandedSection === section.status ? (
              <View style={styles.sectionBody}>
                {orders.length ? (
                  orders.map(renderCompactOrder)
                ) : (
                  <Text style={[styles.meta, { color: theme.colors.textMuted, padding: 10 }]}>No orders in this status.</Text>
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { gap: 8, padding: 14 },
  card: { borderRadius: 14, borderWidth: 1, gap: 6, padding: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  flex1: { flex: 1 },
  feeInput: { width: 74 },
  applyRateBtn: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minHeight: 38, paddingHorizontal: 12 },
  applyRateText: { fontSize: 12, fontWeight: '800' },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 8, paddingVertical: 8 },
  meta: { fontSize: 11, fontWeight: '500' },
  helper: { fontSize: 13, fontWeight: '500' },
  shipRow: { alignItems: 'center', borderBottomWidth: 0.5, flexDirection: 'row', gap: 8, paddingVertical: 4 },
  shipName: { fontSize: 13, fontWeight: '700' },
  delShipBtn: { padding: 4 },
  addShipBtn: { alignItems: 'center', borderRadius: 10, height: 38, justifyContent: 'center', width: 38 },
  refundRow: { borderRadius: 8, borderWidth: 0.5, gap: 4, padding: 8 },
  sectionHeader: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sectionHeaderLeft: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  badge: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minWidth: 20, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  sectionBody: { gap: 4, paddingLeft: 4, paddingRight: 4 },
  orderRow: { borderBottomWidth: 0.5, gap: 3, paddingVertical: 8 },
  orderHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  orderNo: { fontSize: 13, fontWeight: '800' },
  statusBadge: { fontSize: 11, fontWeight: '800' },
  orderMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  orderTotal: { fontSize: 14, fontWeight: '900' },
  noteInput: { borderRadius: 8, borderWidth: 1, fontSize: 12, marginTop: 6, paddingHorizontal: 8, paddingVertical: 7 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  actionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  actionBtnText: { fontSize: 11, fontWeight: '700' },
});
