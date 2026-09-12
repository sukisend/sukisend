import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { BrandedLoader } from '../../components/BrandedLoader';
import { DateRangePicker } from '../../components/DateRangePicker';
import { EmptyState } from '../../components/EmptyState';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { RangeChips } from '../../components/RangeChips';
import { SectionHeader } from '../../components/SectionHeader';
import { TrackingMap } from '../../components/TrackingMap';
import { useBrandAlert } from '../../hooks/useBrandAlert';
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
import { buildAddressQuery, fetchDrivingRoute, geocodeAddress, getStoreCoordinates, haversineDistanceKm } from '../../services/geocodingService';
import { fetchOrderTrackingEvents } from '../../services/orderService';
import { DateRange, Order, OrderStatus, OrderTrackingEvent, SalesRangePreset, ShippingMethod } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';

const STATUS_PAGE_SIZE = 6;

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

const LOCATION_STATUS_SET = new Set<OrderStatus>(['shipped', 'out_for_delivery', 'delivered']);

function normalizeOrderStatus(status: OrderStatus): OrderStatus {
  if (status === 'confirmed' || status === 'preparing' || status === 'packed') {
    return 'approved';
  }

  return status;
}

function isFiniteCoordinate(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getTrackingAddressCandidates(order: Order) {
  const safeDeliveryAddress = typeof order.deliveryAddress === 'string' ? order.deliveryAddress : '';
  const addressTokens = safeDeliveryAddress
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const fallbacks = [
    buildAddressQuery([safeDeliveryAddress, 'Philippines']),
    buildAddressQuery([order.deliveryArea, 'Philippines']),
    buildAddressQuery(addressTokens.slice(-4)),
    buildAddressQuery(addressTokens.slice(-3)),
    buildAddressQuery(addressTokens.slice(-2)),
  ];

  return [...new Set(fallbacks.filter(Boolean))];
}

function parseCoordinateFromText(value: string) {
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
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

const STATUS_GROUPS: Array<{
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  statuses: OrderStatus[];
}> = [
  {
    key: 'active',
    title: 'Active Orders',
    icon: 'time-outline',
    statuses: ['pending', 'approved', 'shipped', 'out_for_delivery'],
  },
  {
    key: 'completed',
    title: 'Completed',
    icon: 'checkmark-circle-outline',
    statuses: ['delivered', 'completed'],
  },
  {
    key: 'issues',
    title: 'Issues',
    icon: 'warning-outline',
    statuses: ['cancelled', 'refund_requested', 'refunded'],
  },
];

interface ShippingForm {
  name: string;
  description: string;
  baseFee: string;
  ratePerKm: string;
  etaMinDays: string;
  etaMaxDays: string;
}

const EMPTY_SHIPPING_FORM: ShippingForm = {
  name: '',
  description: '',
  baseFee: '',
  ratePerKm: '15',
  etaMinDays: '',
  etaMaxDays: '',
};

export function AdminTransactionsScreen() {
  const { theme } = useTheme();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [rangePreset, setRangePreset] = useState<SalesRangePreset>('today');
  const [customRange, setCustomRange] = useState({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD'),
  });
  const [transactions, setTransactions] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingForm, setShippingForm] = useState<ShippingForm>(EMPTY_SHIPPING_FORM);
  const [loading, setLoading] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);
  const [shippingExpanded, setShippingExpanded] = useState(false);
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [activeStatus, setActiveStatus] = useState<OrderStatus | null>(null);
  const [statusPage, setStatusPage] = useState(1);
  const [liveTrackingOrderId, setLiveTrackingOrderId] = useState<string | null>(null);
  const [mapOrder, setMapOrder] = useState<Order | null>(null);
  const [mapEvents, setMapEvents] = useState<OrderTrackingEvent[]>([]);
  const [mapDestination, setMapDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapRouteCoordinates, setMapRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [mapRouteDistanceKm, setMapRouteDistanceKm] = useState<number | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const liveTrackingSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const liveTrackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const activeStatusOrders = useMemo(() => {
    if (!activeStatus) {
      return [];
    }
    return ordersByStatus[activeStatus] ?? [];
  }, [activeStatus, ordersByStatus]);

  const statusPageCount = useMemo(
    () => Math.max(1, Math.ceil(activeStatusOrders.length / STATUS_PAGE_SIZE)),
    [activeStatusOrders.length],
  );

  const statusPageOrders = useMemo(() => {
    const start = (statusPage - 1) * STATUS_PAGE_SIZE;
    return activeStatusOrders.slice(start, start + STATUS_PAGE_SIZE);
  }, [activeStatusOrders, statusPage]);

  const statusSectionMap = useMemo(() => {
    const map = new Map<OrderStatus, { title: string; icon: keyof typeof Ionicons.glyphMap }>();
    for (const section of STATUS_SECTIONS) {
      map.set(section.status, { title: section.title, icon: section.icon });
    }
    return map;
  }, []);
  const mapOrigin = useMemo(() => getStoreCoordinates(), []);
  const mapCoordinates = useMemo(() => {
    if (!mapOrder) {
      return [];
    }

    const fromEvents = [...mapEvents]
      .sort((a, b) => new Date(a.eventAt).valueOf() - new Date(b.eventAt).valueOf())
      .filter((item) => isFiniteCoordinate(item.latitude) && isFiniteCoordinate(item.longitude))
      .map((item) => ({
        latitude: item.latitude as number,
        longitude: item.longitude as number,
      }));

    if (fromEvents.length) {
      return fromEvents;
    }

    if (isFiniteCoordinate(mapOrder.latestLat) && isFiniteCoordinate(mapOrder.latestLng)) {
      return [{ latitude: mapOrder.latestLat, longitude: mapOrder.latestLng }];
    }

    return [];
  }, [mapEvents, mapOrder]);

  useEffect(() => {
    if (!activeStatus) {
      setStatusPage(1);
      return;
    }

    if (statusPage > statusPageCount) {
      setStatusPage(statusPageCount);
    }
  }, [activeStatus, statusPage, statusPageCount]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const [rows, shipping, openRefunds] = await Promise.all([
        fetchRecentTransactions(80, rangePreset, rangePreset === 'custom' ? rangeIso : undefined),
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

  useEffect(() => {
    return () => {
      if (liveTrackingIntervalRef.current) {
        clearInterval(liveTrackingIntervalRef.current);
        liveTrackingIntervalRef.current = null;
      }
      if (liveTrackingSubscriptionRef.current) {
        try {
          liveTrackingSubscriptionRef.current.remove();
        } catch {
          // Expo web can throw from remove() in some environments.
        }
        liveTrackingSubscriptionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapOrder) {
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const events = await fetchOrderTrackingEvents(mapOrder.id);
        if (!cancelled) {
          setMapEvents(events);
        }
      } catch {
        // Keep the last successful points in the map.
      }
    };

    refresh();
    if (!['shipped', 'out_for_delivery', 'delivered'].includes(mapOrder.status)) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(refresh, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mapOrder]);

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
    const note = (statusNotes[order.id] ?? '').trim();

    try {
      // Respect SQL transition rules while preserving the compact UI actions.
      const transitionSteps: OrderStatus[] =
        ['approved', 'confirmed', 'preparing'].includes(order.status) && (nextStatus === 'shipped' || nextStatus === 'out_for_delivery')
          ? ['packed', nextStatus]
          : [nextStatus];

      for (let index = 0; index < transitionSteps.length; index += 1) {
        const step = transitionSteps[index];
        const isFinalStep = index === transitionSteps.length - 1;
        const coords = LOCATION_STATUS_SET.has(step) ? await getCurrentCoordinates() : null;
        const defaultFinalNote = `Order is now ${STATUS_LABEL[nextStatus].toLowerCase()}.`;
        const baseStepNote = isFinalStep ? (note || defaultFinalNote) : `Auto-progress: ${STATUS_LABEL[step]}.`;
        const locationSuffix = coords
          ? ` Rider location: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}.`
          : '';
        const stepNote = `${baseStepNote}${locationSuffix}`.trim();

        await updateOrderStatus(order.id, step, stepNote || undefined, coords?.latitude, coords?.longitude);
      }

      setStatusNotes((prev) => ({ ...prev, [order.id]: '' }));
      await loadTransactions();
    } catch (error) {
      console.warn('Failed to update order status', error);
    }
  };

  const stopLiveTracking = () => {
    if (liveTrackingIntervalRef.current) {
      clearInterval(liveTrackingIntervalRef.current);
      liveTrackingIntervalRef.current = null;
    }
    if (liveTrackingSubscriptionRef.current) {
      try {
        liveTrackingSubscriptionRef.current.remove();
      } catch {
        // Expo web can throw from remove() in some environments.
      }
    }
    liveTrackingSubscriptionRef.current = null;
    setLiveTrackingOrderId(null);
  };

  const startLiveTracking = async (order: Order) => {
    if (liveTrackingOrderId === order.id) {
      stopLiveTracking();
      return;
    }

    stopLiveTracking();

    const pushLiveLocation = async () => {
      const coords = await getCurrentCoordinates();
      if (!coords) {
        return;
      }
      try {
        // Keep current exact status; this posts a location ping without forcing an invalid transition.
        await updateOrderStatus(
          order.id,
          order.status,
          `Live rider location update (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`,
          coords.latitude,
          coords.longitude,
        );
      } catch {
        // Keep live tracking active even when single update fails.
      }
    };

    if (Platform.OS === 'web') {
      await pushLiveLocation();
      liveTrackingIntervalRef.current = setInterval(() => {
        void pushLiveLocation();
      }, 6000);
      setLiveTrackingOrderId(order.id);
      return;
    }

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
          await updateOrderStatus(order.id, order.status, `Live rider location update (${lat.toFixed(5)}, ${lng.toFixed(5)})`, lat, lng);
        } catch {
          // Keep live tracking active even when single update fails.
        }
      },
    );

    liveTrackingSubscriptionRef.current = subscription;
    setLiveTrackingOrderId(order.id);
  };

  const closeMapModal = () => {
    setMapOrder(null);
    setMapEvents([]);
    setMapDestination(null);
    setMapRouteCoordinates([]);
    setMapRouteDistanceKm(null);
    setMapBusy(false);
  };

  const openMapModal = async (order: Order) => {
    setMapOrder(order);
    setMapEvents([]);
    setMapDestination(null);
    setMapRouteCoordinates([]);
    setMapRouteDistanceKm(null);
    setMapBusy(true);

    try {
      const eventsPromise = fetchOrderTrackingEvents(order.id);
      const destinationPromise = (async () => {
        const directCoordinate = parseCoordinateFromText(order.deliveryAddress);
        if (directCoordinate) {
          return directCoordinate;
        }

        const deliveryAreaCoordinate = parseCoordinateFromText(order.deliveryArea);
        if (deliveryAreaCoordinate) {
          return deliveryAreaCoordinate;
        }

        const candidates = getTrackingAddressCandidates(order);
        for (const query of candidates) {
          const point = await geocodeAddress(query);
          if (!point) {
            continue;
          }

          const distanceFromStoreKm = haversineDistanceKm(mapOrigin, point);
          const suspiciousStoreMatch = candidates.length > 1 && distanceFromStoreKm < 0.2;
          if (suspiciousStoreMatch) {
            continue;
          }
          return point;
        }

        if (isFiniteCoordinate(order.latestLat) && isFiniteCoordinate(order.latestLng)) {
          return {
            latitude: order.latestLat,
            longitude: order.latestLng,
          };
        }

        return null;
      })();

      const [events, destination] = await Promise.all([eventsPromise, destinationPromise]);
      setMapEvents(events);
      setMapDestination(destination);

      if (destination) {
        const route = await fetchDrivingRoute(mapOrigin, destination);
        const nextCoordinates = route?.coordinates ?? [];
        setMapRouteCoordinates(nextCoordinates.length > 1 ? nextCoordinates : []);
        setMapRouteDistanceKm(route?.distanceKm ?? null);
      }
    } catch {
      setMapEvents([]);
      setMapDestination(null);
      setMapRouteCoordinates([]);
      setMapRouteDistanceKm(null);
    } finally {
      setMapBusy(false);
    }
  };

  const submitShippingMethod = async () => {
    const baseFee = Number(shippingForm.baseFee);
    const ratePerKm = Number(shippingForm.ratePerKm) || 15;
    if (!shippingForm.name.trim()) {
      return;
    }

    setSavingShipping(true);
    try {
      await saveShippingMethod({
        name: shippingForm.name.trim(),
        description: shippingForm.description.trim() || undefined,
        baseFee: baseFee || 0,
        ratePerKm,
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

  const getOrderPalette = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return {
          bg: theme.isDark ? 'rgba(251, 146, 60, 0.16)' : 'rgba(249, 115, 22, 0.12)',
          border: '#F97316',
          badgeBg: '#F97316',
          badgeText: '#FFFFFF',
          amountColor: '#FB923C',
        };
      case 'approved':
      case 'shipped':
      case 'out_for_delivery':
        return {
          bg: theme.isDark ? 'rgba(59, 130, 246, 0.16)' : 'rgba(37, 99, 235, 0.1)',
          border: '#3B82F6',
          badgeBg: '#3B82F6',
          badgeText: '#FFFFFF',
          amountColor: '#60A5FA',
        };
      case 'delivered':
      case 'completed':
        return {
          bg: theme.isDark ? 'rgba(34, 197, 94, 0.16)' : 'rgba(22, 163, 74, 0.11)',
          border: '#22C55E',
          badgeBg: '#22C55E',
          badgeText: '#062E16',
          amountColor: '#4ADE80',
        };
      case 'cancelled':
        return {
          bg: theme.isDark ? 'rgba(248, 113, 113, 0.15)' : 'rgba(239, 68, 68, 0.1)',
          border: '#EF4444',
          badgeBg: '#EF4444',
          badgeText: '#FFFFFF',
          amountColor: '#F87171',
        };
      case 'refund_requested':
      case 'refunded':
        return {
          bg: theme.isDark ? 'rgba(250, 204, 21, 0.14)' : 'rgba(245, 158, 11, 0.11)',
          border: '#F59E0B',
          badgeBg: '#F59E0B',
          badgeText: '#111827',
          amountColor: '#FBBF24',
        };
      default:
        return {
          bg: theme.colors.surface,
          border: theme.colors.border,
          badgeBg: theme.colors.surfaceAlt,
          badgeText: theme.colors.text,
          amountColor: theme.colors.primary,
        };
    }
  };

  const getActionPalette = (status: OrderStatus) => {
    if (status === 'approved' || status === 'completed' || status === 'delivered') {
      return {
        bg: '#22C55E',
        border: '#22C55E',
        text: '#052E16',
      };
    }

    if (status === 'cancelled') {
      return {
        bg: '#EF4444',
        border: '#EF4444',
        text: '#FFFFFF',
      };
    }

    if (status === 'refunded') {
      return {
        bg: '#F59E0B',
        border: '#F59E0B',
        text: '#111827',
      };
    }

    return {
      bg: theme.colors.surface,
      border: theme.colors.border,
      text: theme.colors.text,
    };
  };

  const openStatusPage = (status: OrderStatus) => {
    setActiveStatus(status);
    setStatusPage(1);
  };

  const renderCompactOrder = (order: Order) => {
    const displayStatus = normalizeOrderStatus(order.status);
    const actions = NEXT_ACTIONS[displayStatus] ?? [];
    const palette = getOrderPalette(displayStatus);

    return (
      <View key={order.id} style={[styles.orderRow, { borderColor: palette.border, backgroundColor: palette.bg }]}>
        <View style={styles.orderHead}>
          <Text style={[styles.orderNo, { color: theme.colors.text }]}>{order.orderNo}</Text>
          <Text style={[styles.statusBadge, { backgroundColor: palette.badgeBg, color: palette.badgeText }]}>
            {STATUS_LABEL[displayStatus]}
          </Text>
        </View>

        <View style={styles.orderMeta}>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatDateTime(order.createdAt)}</Text>
          <Text style={[styles.orderTotal, { color: palette.amountColor }]}>{formatPHP(order.total)}</Text>
        </View>

        <Text style={[styles.orderItems, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
        </Text>

        {order.deliveryAddress ? (
          <View style={styles.orderLocation}>
            <Ionicons name="location-outline" size={11} color={theme.colors.textMuted} />
            <Text style={[styles.meta, { color: theme.colors.textMuted, flex: 1 }]} numberOfLines={1}>
              {order.deliveryAddress}
            </Text>
          </View>
        ) : null}

        <TextInput
          value={statusNotes[order.id] ?? ''}
          onChangeText={(value) => setStatusNotes((prev) => ({ ...prev, [order.id]: value }))}
          placeholder="Progress note"
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.noteInput,
            { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
          ]}
        />

        {actions.length ? (
          <View style={styles.actionRow}>
            {actions.map((next) => {
              const actionPalette = getActionPalette(next);
              const iconName = next === 'approved' ? 'checkmark-circle-outline'
                : next === 'shipped' ? 'cube-outline'
                : next === 'out_for_delivery' ? 'bicycle-outline'
                : next === 'delivered' ? 'checkmark-done-outline'
                : next === 'cancelled' ? 'close-circle-outline'
                : next === 'completed' ? 'trophy-outline'
                : 'arrow-forward-outline';
              return (
                <Pressable
                  key={next}
                  style={[styles.actionBtn, { borderColor: actionPalette.border, backgroundColor: actionPalette.bg }]}
                  onPress={() => handleStatusUpdate(order, next)}
                >
                  <Ionicons name={iconName as any} size={12} color={actionPalette.text} />
                  <Text style={[styles.actionBtnText, { color: actionPalette.text }]}>{STATUS_LABEL[next]}</Text>
                </Pressable>
              );
            })}
            {['approved', 'shipped', 'out_for_delivery'].includes(displayStatus) ? (
              <Pressable
                style={[
                  styles.actionBtn,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: liveTrackingOrderId === order.id ? theme.colors.primary : theme.colors.surface,
                  },
                ]}
                onPress={() => startLiveTracking(order)}
              >
                <Ionicons
                  name={liveTrackingOrderId === order.id ? 'radio' : 'location-outline'}
                  size={12}
                  color={liveTrackingOrderId === order.id ? theme.colors.primaryContrast : theme.colors.text}
                />
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: liveTrackingOrderId === order.id ? theme.colors.primaryContrast : theme.colors.text },
                  ]}
                >
                  {liveTrackingOrderId === order.id ? 'Stop GPS' : 'Live GPS'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.actionBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              onPress={() => openMapModal(order)}
            >
              <Ionicons name="map-outline" size={12} color={theme.colors.text} />
              <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Map</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const renderStatusRow = (status: OrderStatus) => {
    const section = statusSectionMap.get(status);
    if (!section) {
      return null;
    }

    const count = ordersByStatus[status]?.length ?? 0;
    const color = getSectionColor(status);

    return (
      <Pressable
        key={status}
        style={[styles.statusRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
        onPress={() => openStatusPage(status)}
      >
        <View style={styles.statusRowLeft}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={section.icon} size={16} color={color} />
          </View>
          <Text style={[styles.statusName, { color: theme.colors.text }]}>{section.title}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.statusCountBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.statusCountText, { color }]}>{count}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
        </View>
      </Pressable>
    );
  };

  const activeSection = activeStatus ? statusSectionMap.get(activeStatus) : null;

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

      {activeStatus ? (
        <>
          <Pressable
            style={[styles.backRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            onPress={() => setActiveStatus(null)}
          >
            <Ionicons name="arrow-back" size={16} color={theme.colors.text} />
            <Text style={[styles.backText, { color: theme.colors.text }]}>Back to status groups</Text>
          </Pressable>

          <View style={[styles.focusCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
            <View style={styles.focusHeader}>
              <View style={styles.focusTitleWrap}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: getSectionColor(activeStatus) + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={activeSection?.icon ?? 'list-outline'} size={16} color={getSectionColor(activeStatus)} />
                </View>
                <Text style={[styles.focusTitle, { color: theme.colors.text }]}>
                  {activeSection?.title ?? STATUS_LABEL[activeStatus]}
                </Text>
              </View>
              <View style={[styles.focusCountBadge, { backgroundColor: getSectionColor(activeStatus) + '20' }]}>
                <Text style={[styles.focusCountText, { color: getSectionColor(activeStatus) }]}>{activeStatusOrders.length}</Text>
              </View>
            </View>

            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Page {statusPage} of {statusPageCount}</Text>
          </View>

          {loading ? <BrandedLoader compact label="Loading orders..." /> : null}
          {!loading && activeStatusOrders.length === 0 ? (
            <EmptyState title="No orders in this status" subtitle="Try another status or date range." />
          ) : null}

          {statusPageOrders.length > 0 ? <View style={styles.sectionBody}>{statusPageOrders.map(renderCompactOrder)}</View> : null}

          {activeStatusOrders.length > 0 ? (
            <View style={styles.paginationRow}>
              <Pressable
                style={[
                  styles.pageButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: statusPage <= 1 ? theme.colors.surfaceAlt : theme.colors.card,
                  },
                ]}
                disabled={statusPage <= 1}
                onPress={() => setStatusPage((prev) => Math.max(1, prev - 1))}
              >
                <Text style={[styles.pageButtonText, { color: statusPage <= 1 ? theme.colors.textMuted : theme.colors.text }]}>Previous</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.pageButton,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: statusPage >= statusPageCount ? theme.colors.surfaceAlt : theme.colors.card,
                  },
                ]}
                disabled={statusPage >= statusPageCount}
                onPress={() => setStatusPage((prev) => Math.min(statusPageCount, prev + 1))}
              >
                <Text
                  style={[
                    styles.pageButtonText,
                    { color: statusPage >= statusPageCount ? theme.colors.textMuted : theme.colors.text },
                  ]}
                >
                  Next
                </Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        <>
          {refunds.length > 0 ? (
            <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="wallet-outline" size={16} color={theme.colors.warning ?? '#F59E0B'} />
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Refund Queue ({refunds.length})</Text>
              </View>
              {refunds.map((request) => (
                <View key={request.id} style={[styles.refundRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.meta, { color: theme.colors.text, fontWeight: '600' }]}>Order: {request.order_id}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{request.reason}</Text>
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                      onPress={async () => {
                        await resolveRefund(request.id, false);
                        await loadTransactions();
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={12} color={theme.colors.text} />
                      <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Reject</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
                      onPress={async () => {
                        await resolveRefund(request.id, true);
                        await loadTransactions();
                      }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={12} color={theme.colors.primaryContrast} />
                      <Text style={[styles.actionBtnText, { color: theme.colors.primaryContrast }]}>Approve</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {loading ? <BrandedLoader compact label="Loading transactions..." /> : null}
          {!loading && !transactions.length ? <EmptyState title="No transactions" subtitle="Try a different date range." /> : null}

          {STATUS_GROUPS.map((group) => (
            <View key={group.key} style={[styles.groupCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
              <View style={styles.groupHeader}>
                <View style={styles.groupHeaderLeft}>
                  <Ionicons name={group.icon} size={16} color={theme.colors.primary} />
                  <Text style={[styles.groupTitle, { color: theme.colors.text }]}>{group.title}</Text>
                </View>
              </View>
              <View style={styles.groupRows}>{group.statuses.map(renderStatusRow)}</View>
            </View>
          ))}
        </>
      )}

      <Modal visible={Boolean(mapOrder)} transparent animationType="slide" onRequestClose={closeMapModal}>
        <ModalBackdrop align="flex-end" overlayOpacity={0.42}>
          <View style={[styles.mapModalCard, { backgroundColor: theme.colors.card }]}>
            <View style={styles.mapModalHeader}>
              <Text style={[styles.mapModalTitle, { color: theme.colors.text }]}>Live Rider Map</Text>
              <Pressable style={[styles.modalIconCloseButton, { backgroundColor: theme.colors.surface }]} onPress={closeMapModal} hitSlop={8}>
                <Ionicons name="close" size={15} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {mapOrder ? (
              <View style={[styles.mapSummaryCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                <Text style={[styles.orderNo, { color: theme.colors.text }]}>{mapOrder.orderNo}</Text>
                <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={2}>
                  {mapOrder.deliveryAddress || 'No saved delivery address'}
                </Text>
              </View>
            ) : null}

            <TrackingMap
              coordinates={mapCoordinates}
              origin={mapOrigin}
              destination={mapDestination}
              routeCoordinates={mapRouteCoordinates}
              routeColor={mapOrder && ['delivered', 'completed'].includes(mapOrder.status) ? '#22C55E' : '#FB923C'}
            />

            {mapRouteDistanceKm !== null ? (
              <Text style={[styles.meta, styles.mapHint, { color: theme.colors.textMuted }]}>
                Road route distance: {mapRouteDistanceKm.toFixed(2)} km
              </Text>
            ) : null}
            {mapDestination && mapRouteDistanceKm === null && !mapBusy ? (
              <Text style={[styles.meta, styles.mapHint, { color: theme.colors.textMuted }]}>
                Road route is still loading. Keep map open for route refresh.
              </Text>
            ) : null}
            {mapBusy ? <Text style={[styles.meta, styles.mapHint, { color: theme.colors.textMuted }]}>Loading latest map data...</Text> : null}
            {!mapBusy && !mapCoordinates.length ? (
              <Text style={[styles.meta, styles.mapHint, { color: theme.colors.textMuted }]}>
                Rider position appears after Start Live GPS sends updates.
              </Text>
            ) : null}
          </View>
        </ModalBackdrop>
      </Modal>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { gap: 10, padding: 14 },
  card: { borderRadius: 14, borderWidth: 1, gap: 8, padding: 14 },
  shippingHeaderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  flex1: { flex: 1 },
  feeInput: { width: 80 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 9 },
  meta: { fontSize: 11, fontWeight: '500' },
  helper: { fontSize: 13, fontWeight: '500' },
  mapModalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    padding: 14,
  },
  mapModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapModalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalIconCloseButton: {
    alignItems: 'center',
    backgroundColor: '#F5F0EB',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  mapSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  mapHint: {
    marginTop: 6,
  },
  shipRow: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 10 },
  shipName: { flex: 1, fontSize: 13, fontWeight: '600' },
  shipFee: { fontSize: 12, fontWeight: '500' },
  delShipBtn: { alignItems: 'center', borderRadius: 8, height: 28, justifyContent: 'center', width: 28 },
  addShipBtn: { alignItems: 'center', borderRadius: 10, height: 38, justifyContent: 'center', width: 38 },
  refundRow: { borderRadius: 10, borderWidth: 1, gap: 6, padding: 10 },
  groupCard: { borderRadius: 14, borderWidth: 1, gap: 8, padding: 14 },
  groupHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  groupHeaderLeft: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  groupTitle: { fontSize: 15, fontWeight: '600' },
  groupRows: { gap: 8 },
  statusRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statusRowLeft: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  statusName: { fontSize: 14, fontWeight: '600' },
  statusCountBadge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statusCountText: { fontSize: 11, fontWeight: '600' },
  statusNavBadge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 26,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  backRow: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  backText: { fontSize: 12, fontWeight: '600' },
  focusCard: { borderRadius: 14, borderWidth: 1, gap: 8, padding: 14 },
  focusHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  focusTitleWrap: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  focusTitle: { fontSize: 15, fontWeight: '600' },
  focusCountBadge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  focusCountText: { fontSize: 12, fontWeight: '600' },
  sectionBody: { gap: 6 },
  orderRow: { borderRadius: 12, borderWidth: 1, gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  orderHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  orderNo: { fontSize: 13, fontWeight: '600' },
  statusBadge: { borderRadius: 999, fontSize: 10, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3 },
  orderMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  orderTotal: { fontSize: 14, fontWeight: '600' },
  orderItems: { fontSize: 11, fontWeight: '500', lineHeight: 16 },
  orderLocation: { alignItems: 'center', flexDirection: 'row', gap: 4, fontSize: 11, fontWeight: '500' },
  noteInput: { borderRadius: 10, borderWidth: 1, fontSize: 12, marginTop: 4, paddingHorizontal: 10, paddingVertical: 8 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  actionBtn: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  actionBtnText: { fontSize: 11, fontWeight: '600' },
  paginationRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  pageButton: { borderRadius: 999, borderWidth: 1, minWidth: 100, paddingVertical: 8 },
  pageButtonText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
