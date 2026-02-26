import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { EmptyState } from '../../components/EmptyState';
import { useTheme } from '../../providers/ThemeProvider';
import { fetchRiderActiveOrders, riderUpdateOrderProgress } from '../../services/riderService';
import { Order, OrderStatus } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  approved: 'shipped',
  shipped: 'out_for_delivery',
  out_for_delivery: 'delivered',
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

export function RiderDeliveriesScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [noteByOrder, setNoteByOrder] = useState<Record<string, string>>({});
  const [liveOrderId, setLiveOrderId] = useState<string | null>(null);
  const liveSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const next = await fetchRiderActiveOrders();
      setOrders(next);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const timer = setInterval(loadOrders, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      liveSubscriptionRef.current?.remove();
      liveSubscriptionRef.current = null;
      setLiveOrderId(null);
    };
  }, []);

  const activeOrdersCount = useMemo(
    () => orders.filter((order) => ['approved', 'shipped', 'out_for_delivery'].includes(order.status)).length,
    [orders],
  );

  const stopLiveTracking = () => {
    liveSubscriptionRef.current?.remove();
    liveSubscriptionRef.current = null;
    setLiveOrderId(null);
  };

  const startLiveTracking = async (order: Order) => {
    if (liveOrderId === order.id) {
      stopLiveTracking();
      return;
    }

    stopLiveTracking();
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return;
    }

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
          await riderUpdateOrderProgress({
            orderId: order.id,
            note: 'Rider GPS update',
            lat,
            lng,
          });
        } catch {
          // keep watcher running even if one update fails
        }
      },
    );

    liveSubscriptionRef.current = subscription;
    setLiveOrderId(order.id);
  };

  const updateStatus = async (order: Order) => {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) {
      return;
    }

    const note = (noteByOrder[order.id] ?? '').trim();
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await riderUpdateOrderProgress({
        orderId: order.id,
        nextStatus,
        note: note || `Order updated to ${STATUS_LABEL[nextStatus].toLowerCase()}.`,
        lat: Number(current.coords.latitude.toFixed(7)),
        lng: Number(current.coords.longitude.toFixed(7)),
      });
      setNoteByOrder((prev) => ({ ...prev, [order.id]: '' }));
      await loadOrders();
    } catch {
      // keep current data if update fails
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ padding: 14, paddingBottom: Math.max(insets.bottom, 8), gap: 8 }}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>Rider Deliveries</Text>
      <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
        Active orders: {activeOrdersCount}
      </Text>

      {loading ? <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Refreshing deliveries...</Text> : null}
      {!loading && orders.length === 0 ? (
        <EmptyState title="No active deliveries" subtitle="Assigned delivery orders will appear here." />
      ) : null}

      {orders.map((order) => {
        const nextStatus = NEXT_STATUS[order.status];
        const canTrack = ['approved', 'shipped', 'out_for_delivery'].includes(order.status);
        return (
          <View key={order.id} style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.orderNo, { color: theme.colors.text }]}>{order.orderNo}</Text>
              <Text style={[styles.badge, { color: theme.colors.primary }]}>{STATUS_LABEL[order.status]}</Text>
            </View>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatDateTime(order.createdAt)}</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={2}>
              {order.deliveryAddress}
            </Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              COD: {formatPHP(order.total)}
            </Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={2}>
              Items: {order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
            </Text>

            <TextInput
              value={noteByOrder[order.id] ?? ''}
              onChangeText={(value) => setNoteByOrder((prev) => ({ ...prev, [order.id]: value }))}
              placeholder="Progress note for customer"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />

            <View style={styles.actions}>
              {nextStatus ? (
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={() => updateStatus(order)}
                >
                  <Text style={[styles.primaryBtnText, { color: theme.colors.primaryContrast }]}>
                    {STATUS_LABEL[nextStatus]}
                  </Text>
                </Pressable>
              ) : null}
              {canTrack ? (
                <Pressable
                  style={[
                    styles.secondaryBtn,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: liveOrderId === order.id ? theme.colors.primary : theme.colors.surface,
                    },
                  ]}
                  onPress={() => startLiveTracking(order)}
                >
                  <Text
                    style={[
                      styles.secondaryBtnText,
                      { color: liveOrderId === order.id ? theme.colors.primaryContrast : theme.colors.text },
                    ]}
                  >
                    {liveOrderId === order.id ? 'Stop Live GPS' : 'Start Live GPS'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderNo: {
    fontSize: 14,
    fontWeight: '800',
  },
  badge: {
    fontSize: 11,
    fontWeight: '800',
  },
  input: {
    borderRadius: 9,
    borderWidth: 1,
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  primaryBtn: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  primaryBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  secondaryBtn: {
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
