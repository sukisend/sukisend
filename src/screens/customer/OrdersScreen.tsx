import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrackingMap } from '../../components/TrackingMap';

import { EmptyState } from '../../components/EmptyState';
import { BrandAlertModal } from '../../components/BrandAlertModal';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { LogoHeader } from '../../components/LogoHeader';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useMinimumLoader } from '../../hooks/useMinimumLoader';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { buildAddressQuery, fetchDrivingRoute, geocodeAddress, getStoreCoordinates, haversineDistanceKm } from '../../services/geocodingService';
import { pickAndUploadImages } from '../../services/mediaService';
import {
  cancelCustomerOrder,
  fetchCustomerAddresses,
  fetchCustomerOrders,
  fetchOrderTrackingEvents,
  fetchProductById,
  fetchReviewedOrderItemIds,
  markOrderCompleted,
  requestOrderRefund,
  submitProductReview,
  submitRiderReview,
} from '../../services/productService';
import { useCartStore } from '../../store/cartStore';
import { CustomerAddress, Order, OrderItem, OrderTrackingEvent } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';
import { getProductBasePrice, getVariantUnitPrice } from '../../utils/pricing';

const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Order placed',
  approved: 'Approved',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  refund_requested: 'Refund requested',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};
const TRACKABLE_STATUSES: Order['status'][] = ['shipped', 'out_for_delivery', 'delivered', 'completed'];
const ORDERS_PAGE_SIZE = 5;
const RIDER_PROGRESS_ICON = require('../../../assets/rider.png');
const SUPPORT_CONTACT_NUMBER = '09513647885';

function getOrderHistoryProgress(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 0.12;
    case 'approved':
      return 0.2;
    case 'confirmed':
      return 0.32;
    case 'preparing':
      return 0.44;
    case 'packed':
      return 0.56;
    case 'shipped':
      return 0.68;
    case 'out_for_delivery':
      return 0.82;
    case 'delivered':
      return 0.94;
    case 'completed':
      return 1;
    case 'cancelled':
    case 'refunded':
    case 'refund_requested':
      return 1;
    default:
      return 0;
  }
}

function getOrderProgressLabel(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 'Order placed';
    case 'approved':
    case 'confirmed':
      return 'Approved';
    case 'preparing':
    case 'packed':
      return 'Preparing delivery';
    case 'shipped':
      return 'Shipped';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    case 'refund_requested':
      return 'Refund requested';
    case 'refunded':
      return 'Refunded';
    default:
      return 'Processing';
  }
}

function canRequestRefund(order: Order) {
  if (!['delivered', 'completed'].includes(order.status)) {
    return false;
  }
  if (!order.refundDeadlineAt) {
    return true;
  }
  return new Date(order.refundDeadlineAt).valueOf() > Date.now();
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

function normalizeLookup(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function pickBestAddressCoordinate(order: Order, addresses: CustomerAddress[]) {
  if (!addresses.length) {
    return null;
  }

  const orderAddress = normalizeLookup(order.deliveryAddress);
  const orderArea = normalizeLookup(order.deliveryArea);
  const orderTokens = Array.from(
    new Set(
      orderAddress
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    ),
  );

  let best: { score: number; point: { latitude: number; longitude: number } } | null = null;

  for (const address of addresses) {
    if (!isFiniteCoordinate(address.latitude) || !isFiniteCoordinate(address.longitude)) {
      continue;
    }

    const candidate = normalizeLookup(
      [address.line1, address.line2, address.barangay, address.city, address.province, address.postalCode, address.countryRegion]
        .filter(Boolean)
        .join(', '),
    );

    let score = 0;
    if (orderArea && candidate.includes(orderArea)) {
      score += 4;
    }
    for (const token of orderTokens) {
      if (candidate.includes(token)) {
        score += 1;
      }
    }

    if (!best || score > best.score) {
      best = {
        score,
        point: { latitude: Number(address.latitude), longitude: Number(address.longitude) },
      };
    }
  }

  if (best && best.score >= 1) {
    return best.point;
  }

  const defaultAddress = addresses.find(
    (address) => address.isDefault && isFiniteCoordinate(address.latitude) && isFiniteCoordinate(address.longitude),
  );
  if (defaultAddress) {
    return {
      latitude: Number(defaultAddress.latitude),
      longitude: Number(defaultAddress.longitude),
    };
  }

  const newestAddressWithCoordinates = [...addresses]
    .reverse()
    .find((address) => isFiniteCoordinate(address.latitude) && isFiniteCoordinate(address.longitude));
  if (newestAddressWithCoordinates) {
    return {
      latitude: Number(newestAddressWithCoordinates.latitude),
      longitude: Number(newestAddressWithCoordinates.longitude),
    };
  }

  return null;
}

function isOrderTrackable(status: Order['status']) {
  return TRACKABLE_STATUSES.includes(status);
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function getStatusRouteProgress(status: Order['status']) {
  switch (status) {
    case 'shipped':
      return 0.35;
    case 'out_for_delivery':
      return 0.7;
    case 'delivered':
      return 1;
    case 'completed':
      return 1;
    default:
      return 0;
  }
}

function getRoutePointAtProgress(route: Array<{ latitude: number; longitude: number }>, progress: number) {
  if (!route.length) {
    return null;
  }

  const normalized = clampProgress(progress);
  const index = Math.round(normalized * (route.length - 1));
  return route[Math.max(0, Math.min(index, route.length - 1))] ?? null;
}

function simplifyTrackingCoordinates(points: Array<{ latitude: number; longitude: number }>, maxPoints = 180) {
  if (!points.length) {
    return points;
  }

  if (points.length <= maxPoints) {
    return points;
  }

  const stride = Math.ceil(points.length / maxPoints);
  const simplified: Array<{ latitude: number; longitude: number }> = [];
  for (let index = 0; index < points.length; index += stride) {
    simplified.push(points[index]);
  }

  const lastPoint = points[points.length - 1];
  const currentLast = simplified[simplified.length - 1];
  if (!currentLast || currentLast.latitude !== lastPoint.latitude || currentLast.longitude !== lastPoint.longitude) {
    simplified.push(lastPoint);
  }

  return simplified;
}

export function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const addToCart = useCartStore((state) => state.addItem);
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersPage, setOrdersPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [reviewedOrderItemIds, setReviewedOrderItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<OrderTrackingEvent[]>([]);
  const [trackingDestination, setTrackingDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [trackingRouteCoordinates, setTrackingRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [trackingRouteDistanceKm, setTrackingRouteDistanceKm] = useState<number | null>(null);
  const [trackingSimulatedProgress, setTrackingSimulatedProgress] = useState<number | null>(null);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [trackingMapVisible, setTrackingMapVisible] = useState(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [refundEvidenceUrls, setRefundEvidenceUrls] = useState<string[]>([]);
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewItem, setReviewItem] = useState<OrderItem | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [riderRating, setRiderRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewImageUrls, setReviewImageUrls] = useState<string[]>([]);
  const [reviewUploadProgress, setReviewUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [refundUploadProgress, setRefundUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const showLoader = useMinimumLoader(loading, 500);

  const loadOrders = useCallback(async () => {
    if (!profile?.id) {
      setOrders([]);
      setReviewedOrderItemIds(new Set());
      return;
    }

    setLoading(true);
    try {
      const [nextOrders, reviewedItemIds] = await Promise.all([
        fetchCustomerOrders(profile.id),
        fetchReviewedOrderItemIds(profile.id),
      ]);
      setOrders(nextOrders);
      setReviewedOrderItemIds(new Set(reviewedItemIds));
    } catch {
      setOrders([]);
      setReviewedOrderItemIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

  const trackingCoordinates = useMemo(() => {
    const coords = [...trackingEvents]
      .sort((a, b) => new Date(a.eventAt).valueOf() - new Date(b.eventAt).valueOf())
      .filter((item) => isFiniteCoordinate(item.latitude) && isFiniteCoordinate(item.longitude))
      .map((item) => ({
        latitude: item.latitude as number,
        longitude: item.longitude as number,
      }));
    return coords;
  }, [trackingEvents]);
  const trackingOrigin = useMemo(() => getStoreCoordinates(), []);
  const trackingLatestPoint = useMemo(() => {
    if (!trackingOrder) {
      return null;
    }

    if (!isFiniteCoordinate(trackingOrder.latestLat) || !isFiniteCoordinate(trackingOrder.latestLng)) {
      return null;
    }

    return {
      latitude: trackingOrder.latestLat,
      longitude: trackingOrder.latestLng,
    };
  }, [trackingOrder]);
  const trackingSimulatedPoint = useMemo(
    () => getRoutePointAtProgress(trackingRouteCoordinates, trackingSimulatedProgress ?? 0),
    [trackingRouteCoordinates, trackingSimulatedProgress],
  );
  const trackingMapCoordinates = useMemo(() => {
    if (!trackingOrder) {
      return [];
    }

    if (trackingCoordinates.length) {
      return trackingCoordinates;
    }

    if (trackingLatestPoint) {
      return [trackingLatestPoint];
    }

    if (trackingOrder.status === 'completed' || trackingOrder.status === 'delivered') {
      if (trackingDestination) {
        return [trackingDestination];
      }
      return trackingSimulatedPoint ? [trackingSimulatedPoint] : [];
    }

    if (trackingOrder.status === 'shipped' || trackingOrder.status === 'out_for_delivery') {
      return trackingSimulatedPoint ? [trackingSimulatedPoint] : trackingDestination ? [trackingOrigin] : [];
    }

    return [];
  }, [trackingCoordinates, trackingDestination, trackingLatestPoint, trackingOrder, trackingOrigin, trackingSimulatedPoint]);

  useEffect(() => {
    if (!trackingOrder) {
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const nextEvents = await fetchOrderTrackingEvents(trackingOrder.id);
        if (!cancelled) {
          setTrackingEvents(nextEvents);
        }
      } catch {
        // Keep last available timeline when refresh fails.
      }
    };

    refresh();
    if (trackingOrder.status !== 'shipped' && trackingOrder.status !== 'out_for_delivery') {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(refresh, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [trackingOrder]);

  useEffect(() => {
    if (!trackingOrder || !trackingRouteCoordinates.length) {
      setTrackingSimulatedProgress(null);
      return;
    }

    const hasLiveTracking = trackingCoordinates.length > 0 || Boolean(trackingLatestPoint);
    if (hasLiveTracking) {
      setTrackingSimulatedProgress(null);
      return;
    }

    const baseProgress = getStatusRouteProgress(trackingOrder.status);
    setTrackingSimulatedProgress(baseProgress);

    if (trackingOrder.status !== 'shipped' && trackingOrder.status !== 'out_for_delivery') {
      return;
    }

    let progress = baseProgress;
    const targetProgress = trackingOrder.status === 'out_for_delivery' ? 0.94 : 0.58;
    const timer = setInterval(() => {
      progress = Math.min(targetProgress, progress + 0.02);
      setTrackingSimulatedProgress(progress);
      if (progress >= targetProgress) {
        clearInterval(timer);
      }
    }, 2200);

    return () => clearInterval(timer);
  }, [
    trackingCoordinates.length,
    trackingLatestPoint,
    trackingOrder?.id,
    trackingOrder?.status,
    trackingRouteCoordinates,
  ]);

  const pendingReviewItems = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'completed')
        .flatMap((order) =>
          order.items
            .filter((item) => !reviewedOrderItemIds.has(item.id))
            .map((item) => ({
              order,
              item,
            })),
        ),
    [orders, reviewedOrderItemIds],
  );
  const totalOrderPages = useMemo(() => Math.max(1, Math.ceil(orders.length / ORDERS_PAGE_SIZE)), [orders.length]);
  const paginatedOrders = useMemo(() => {
    const start = (ordersPage - 1) * ORDERS_PAGE_SIZE;
    return orders.slice(start, start + ORDERS_PAGE_SIZE);
  }, [orders, ordersPage]);

  useEffect(() => {
    setOrdersPage((prev) => Math.min(prev, totalOrderPages));
  }, [totalOrderPages]);

  useEffect(() => {
    if (selectedOrder && !orders.some((order) => order.id === selectedOrder.id)) {
      setSelectedOrder(null);
    }
  }, [orders, selectedOrder]);

  const orderStatusColor = (status: Order['status']) => {
    if (['completed', 'delivered'].includes(status)) {
      return theme.colors.success;
    }
    if (['cancelled', 'refunded'].includes(status)) {
      return theme.colors.danger;
    }
    if (status === 'out_for_delivery' || status === 'shipped') {
      return theme.colors.primary;
    }
    return theme.colors.warning ?? '#F59E0B';
  };
  const historyCardPalette = theme.isDark
    ? ['#0E1A2F']
    : ['#FFFFFF'];

  const openReviewModal = (order: Order, item: OrderItem) => {
    setReviewOrder(order);
    setReviewItem(item);
    setReviewRating(5);
    setRiderRating(5);
    setReviewComment('');
    setReviewImageUrls([]);
  };

  const openImagePreview = (imagesToPreview: string[], index = 0) => {
    if (!imagesToPreview.length) {
      return;
    }
    setPreviewImages(imagesToPreview);
    setPreviewIndex(index);
    setPreviewVisible(true);
  };

  const handleBuyAgain = async (orderItem: OrderItem) => {
    try {
      const product = await fetchProductById(orderItem.productId);
      if (!product || !product.isActive) {
        showAlert({
          title: 'Product unavailable',
          message: 'This item is no longer available for purchase.',
          tone: 'info',
        });
        return;
      }

      if (product.stock <= 0) {
        showAlert({
          title: 'Out of stock',
          message: `${product.name} is currently out of stock.`,
          tone: 'info',
        });
        return;
      }

      const matchedVariant = orderItem.variantId
        ? product.variants?.find((variant) => variant.id === orderItem.variantId && variant.isActive)
        : undefined;

      addToCart(product, Math.max(1, orderItem.quantity), {
        variantId: matchedVariant?.id,
        variantLabel: matchedVariant
          ? `${matchedVariant.name}: ${matchedVariant.value}`
          : orderItem.variantValue
            ? `${orderItem.variantName ?? 'Variant'}: ${orderItem.variantValue}`
            : undefined,
        unitPrice: matchedVariant ? getVariantUnitPrice(product, matchedVariant) : getProductBasePrice(product),
      });

      showAlert({
        title: 'Added to cart',
        message: `${product.name} was added to your cart.`,
        tone: 'success',
        actionLabel: 'View Cart',
        onAction: () => navigation.navigate('CustomerTabs', { screen: 'Cart' }),
      });
    } catch (error) {
      showAlert({
        title: 'Buy again failed',
        message: error instanceof Error ? error.message : 'Unable to add this item to cart.',
        tone: 'error',
      });
    }
  };

  const closeTrackingModal = () => {
    setTrackingOrder(null);
    setTrackingDestination(null);
    setTrackingRouteCoordinates([]);
    setTrackingRouteDistanceKm(null);
    setTrackingSimulatedProgress(null);
    setTrackingMapVisible(false);
    setTrackingBusy(false);
  };

  const openTrackingModal = async (order: Order) => {
    if (!isOrderTrackable(order.status)) {
      showAlert({
        title: 'Tracking not available',
        message: 'Tracking route will appear once your order is shipped.',
        tone: 'info',
      });
      return;
    }

    setTrackingOrder(order);
    setTrackingEvents([]);
    setTrackingDestination(null);
    setTrackingRouteCoordinates([]);
    setTrackingRouteDistanceKm(null);
    setTrackingSimulatedProgress(null);
    setTrackingMapVisible(false);
    setTrackingBusy(true);

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

        if (profile?.id) {
          try {
            const customerAddresses = await fetchCustomerAddresses(profile.id);
            const matchedPoint = pickBestAddressCoordinate(order, customerAddresses);
            if (matchedPoint) {
              return matchedPoint;
            }
          } catch {
            // Continue with geocoding fallback if address list lookup fails.
          }
        }

        const candidates = getTrackingAddressCandidates(order);
        for (const query of candidates) {
          const point = await geocodeAddress(query);
          if (!point) {
            continue;
          }

          // Ignore suspicious geocode matches that resolve too close to the store.
          const distanceFromStoreKm = haversineDistanceKm(trackingOrigin, point);
          const suspiciousStoreMatch = candidates.length > 1 && distanceFromStoreKm < 0.2;
          if (suspiciousStoreMatch) {
            continue;
          }

          if (point) {
            return point;
          }
        }

        if (
          (order.status === 'delivered' || order.status === 'completed') &&
          isFiniteCoordinate(order.latestLat) &&
          isFiniteCoordinate(order.latestLng)
        ) {
          return {
            latitude: order.latestLat,
            longitude: order.latestLng,
          };
        }

        return null;
      })();
      const [events, destination] = await Promise.all([eventsPromise, destinationPromise]);
      setTrackingEvents(events);
      setTrackingDestination(destination ? { latitude: destination.latitude, longitude: destination.longitude } : null);
      if (destination) {
        const route = await fetchDrivingRoute(trackingOrigin, destination);
        const nextCoordinates = route?.coordinates ?? [];
        if (nextCoordinates.length > 1) {
          setTrackingRouteCoordinates(simplifyTrackingCoordinates(nextCoordinates, 180));
          setTrackingRouteDistanceKm(route?.distanceKm ?? null);
        } else {
          setTrackingRouteCoordinates([]);
          setTrackingRouteDistanceKm(route?.distanceKm ?? null);
        }
      }
    } catch {
      showAlert({
        title: 'Tracking unavailable',
        message: 'No tracking events available yet.',
        tone: 'info',
      });
    } finally {
      setTrackingBusy(false);
    }
  };

  const openSupportHotline = async () => {
    try {
      await Linking.openURL(`tel:${SUPPORT_CONTACT_NUMBER}`);
    } catch {
      showAlert({
        title: 'Call unavailable',
        message: `Please call support manually at ${SUPPORT_CONTACT_NUMBER}.`,
        tone: 'info',
      });
    }
  };

  if (role === 'guest') {
    return (
      <View
        style={[
          styles.guestWrap,
          { backgroundColor: theme.colors.background, paddingBottom: Math.max(insets.bottom, 8), paddingTop: insets.top + 10 },
        ]}
      >
        <EmptyState title="Track your deliveries" subtitle="Sign in to view your order history and order status." />
        <Pressable
          style={[styles.loginButton, { backgroundColor: theme.colors.primary }]}
          onPress={() => navigation.navigate('Auth', { mode: 'signin', intent: 'account' })}
        >
          <Text style={[styles.loginButtonText, { color: theme.colors.primaryContrast }]}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 8), paddingTop: insets.top + 10 }]}
    >
      <LogoHeader />
      <Text style={[styles.title, { color: theme.colors.text }]}>Order History</Text>
      {showLoader ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((item) => (
            <View key={item} style={[styles.skeletonCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
              <View style={[styles.skeletonLine, styles.skeletonLineShort, { backgroundColor: theme.colors.surfaceAlt }]} />
              <View style={[styles.skeletonLine, { backgroundColor: theme.colors.surfaceAlt }]} />
              <View style={[styles.skeletonLine, styles.skeletonLineTiny, { backgroundColor: theme.colors.surfaceAlt }]} />
            </View>
          ))}
        </View>
      ) : null}

      {!loading && !orders.length ? (
        <EmptyState title="No transactions yet" subtitle="Your completed checkout orders will appear here." />
      ) : null}

      {!loading && pendingReviewItems.length ? (
        <View
          style={[
            styles.pendingReviewCard,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.pendingReviewTitle, { color: theme.colors.text }]}>
            Pending Reviews ({pendingReviewItems.length})
          </Text>
          <Text style={[styles.pendingReviewSub, { color: theme.colors.textMuted }]}>
            Rate delivered items to help other customers.
          </Text>
          <View style={styles.pendingReviewList}>
            {pendingReviewItems.slice(0, 6).map(({ order, item }) => (
              <View key={item.id} style={[styles.pendingReviewRow, { borderColor: theme.colors.border }]}>
                <View style={styles.pendingReviewInfo}>
                  <Text style={[styles.pendingReviewItemName, { color: theme.colors.text }]} numberOfLines={1}>
                    {item.productName}
                  </Text>
                  <Text style={[styles.pendingReviewMeta, { color: theme.colors.textMuted }]}>
                    {order.orderNo} - Qty {item.quantity}
                  </Text>
                </View>
                <View style={styles.pendingReviewActions}>
                  <Pressable
                    style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                    onPress={() => handleBuyAgain(item)}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Buy Again</Text>
                  </Pressable>
                  <Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} onPress={() => openReviewModal(order, item)}>
                    <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Review</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {paginatedOrders.map((order, index) => {
          const leadItem = order.items[0];
          const progressPercent = Math.round(getOrderHistoryProgress(order.status) * 100);
          const toneColor = orderStatusColor(order.status);
          const cardTone = historyCardPalette[index % historyCardPalette.length];

          return (
            <Pressable
              key={order.id}
              style={[styles.card, { backgroundColor: cardTone, borderColor: theme.colors.border }]}
              onPress={() => setSelectedOrder(order)}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.orderNo, { color: theme.colors.text }]}>{order.orderNo}</Text>
                <View
                  style={[
                    styles.orderStatusBadge,
                    { borderColor: `${toneColor}44`, backgroundColor: `${toneColor}1A` },
                  ]}
                >
                  <Text style={[styles.orderStatus, { color: toneColor }]}>{STATUS_LABEL[order.status]}</Text>
                </View>
              </View>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Ordered {formatDateTime(order.createdAt)}</Text>
              <View style={styles.orderPreviewRow}>
                {leadItem?.productImageUrl ? (
                  <Image source={{ uri: leadItem.productImageUrl }} style={styles.orderItemImage} />
                ) : (
                  <View style={[styles.orderItemImageFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[styles.orderItemImageFallbackText, { color: theme.colors.textMuted }]}>IMG</Text>
                  </View>
                )}
                <Text style={[styles.itemRow, { color: theme.colors.text }]} numberOfLines={2}>
                  {leadItem?.productName ?? 'Order item'}
                  {leadItem?.variantValue ? ` (${leadItem.variantValue})` : ''}
                  {order.items.length > 1 ? ` +${order.items.length - 1} more` : ''}
                </Text>
              </View>
              <View style={styles.progressRow}>
                <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
                  <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: toneColor }]}>
                    {progressPercent > 0 ? <Image source={RIDER_PROGRESS_ICON} style={styles.progressRiderIcon} resizeMode="contain" /> : null}
                  </View>
                </View>
                <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>{progressPercent}%</Text>
              </View>
              <Text style={[styles.progressStageLabel, { color: theme.colors.textMuted }]}>
                {getOrderProgressLabel(order.status)}
              </Text>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>COD Total</Text>
                <Text style={[styles.totalValue, { color: theme.colors.primary }]}>{formatPHP(order.total)}</Text>
              </View>
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Tap to view order details</Text>
            </Pressable>
          );
        })}
      </View>
      {totalOrderPages > 1 ? (
        <View style={styles.paginationRow}>
          <Pressable
            style={[styles.secondaryButton, styles.paginationButton, { borderColor: theme.colors.border, opacity: ordersPage === 1 ? 0.45 : 1 }]}
            onPress={() => setOrdersPage((prev) => Math.max(1, prev - 1))}
            disabled={ordersPage === 1}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Previous</Text>
          </Pressable>
          <Text style={[styles.paginationLabel, { color: theme.colors.textMuted }]}>
            Page {ordersPage} of {totalOrderPages}
          </Text>
          <Pressable
            style={[styles.secondaryButton, styles.paginationButton, { borderColor: theme.colors.border, opacity: ordersPage === totalOrderPages ? 0.45 : 1 }]}
            onPress={() => setOrdersPage((prev) => Math.min(totalOrderPages, prev + 1))}
            disabled={ordersPage === totalOrderPages}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Next</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={Boolean(selectedOrder)} transparent animationType="slide" onRequestClose={() => setSelectedOrder(null)}>
        <ModalBackdrop align="flex-end" overlayOpacity={0.42}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Order Details</Text>
              <Pressable style={styles.modalIconCloseButton} onPress={() => setSelectedOrder(null)} hitSlop={8}>
                <Ionicons name="close" size={15} color="#FFFFFF" />
              </Pressable>
            </View>
            {selectedOrder ? (
              <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} showsVerticalScrollIndicator={false}>
                <View style={styles.detailTopRow}>
                  <Text style={[styles.orderNo, { color: theme.colors.text }]}>{selectedOrder.orderNo}</Text>
                  <View
                    style={[
                      styles.orderStatusBadgeStrong,
                      {
                        borderColor: `${orderStatusColor(selectedOrder.status)}66`,
                        backgroundColor: `${orderStatusColor(selectedOrder.status)}22`,
                      },
                    ]}
                  >
                    <Text style={[styles.orderStatusBadgeStrongText, { color: orderStatusColor(selectedOrder.status) }]}>
                      {STATUS_LABEL[selectedOrder.status]}
                    </Text>
                  </View>
                </View>

                <View style={[styles.detailMetaCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                  <View style={styles.detailMetaRow}>
                    <Text style={[styles.detailMetaLabel, { color: theme.colors.textMuted }]}>Ordered</Text>
                    <Text style={[styles.detailMetaValue, { color: theme.colors.text }]}>{formatDateTime(selectedOrder.createdAt)}</Text>
                  </View>
                  <View style={styles.detailMetaRow}>
                    <Text style={[styles.detailMetaLabel, { color: theme.colors.textMuted }]}>Shipping</Text>
                    <Text style={[styles.detailMetaValue, { color: theme.colors.text }]}>
                      {selectedOrder.shippingMethodName || 'Not assigned'}
                    </Text>
                  </View>
                  <View style={styles.detailMetaRow}>
                    <Text style={[styles.detailMetaLabel, { color: theme.colors.textMuted }]}>Address</Text>
                    <Text style={[styles.detailMetaValue, { color: theme.colors.text }]} numberOfLines={2}>
                      {selectedOrder.deliveryAddress || 'No saved address'}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressRow}>
                  <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round(getOrderHistoryProgress(selectedOrder.status) * 100)}%`,
                          backgroundColor: orderStatusColor(selectedOrder.status),
                        },
                      ]}
                    >
                      {Math.round(getOrderHistoryProgress(selectedOrder.status) * 100) > 0 ? (
                        <Image source={RIDER_PROGRESS_ICON} style={styles.progressRiderIcon} resizeMode="contain" />
                      ) : null}
                    </View>
                  </View>
                  <Text style={[styles.progressLabel, { color: theme.colors.textMuted }]}>
                    {Math.round(getOrderHistoryProgress(selectedOrder.status) * 100)}%
                  </Text>
                </View>
                <Text style={[styles.progressStageLabel, { color: theme.colors.textMuted }]}>
                  {getOrderProgressLabel(selectedOrder.status)}
                </Text>

                <View style={[styles.modalSection, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                  <View style={styles.modalSectionHeader}>
                    <Text style={[styles.modalSectionTitle, { color: theme.colors.text }]}>Items ({selectedOrder.items.length})</Text>
                  </View>
                  <View style={styles.modalSectionList}>
                    {selectedOrder.items.map((item) => (
                      <View key={item.id} style={styles.orderItemRow}>
                        {item.productImageUrl ? (
                          <Image source={{ uri: item.productImageUrl }} style={styles.orderItemImage} />
                        ) : (
                          <View style={[styles.orderItemImageFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                            <Text style={[styles.orderItemImageFallbackText, { color: theme.colors.textMuted }]}>IMG</Text>
                          </View>
                        )}
                        <View style={styles.itemDetailWrap}>
                          <View style={styles.orderItemMainRow}>
                            <View style={styles.orderItemInfo}>
                              <Text style={[styles.itemRow, { color: theme.colors.text }]} numberOfLines={2}>
                                {item.productName}
                                {item.variantValue ? ` (${item.variantValue})` : ''} x{item.quantity}
                              </Text>
                              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatPHP(item.lineTotal)}</Text>
                            </View>
                            <View style={styles.orderItemActionsCol}>
                              <Pressable
                                style={[styles.secondaryButton, styles.itemActionButton, { borderColor: theme.colors.border }]}
                                onPress={() => handleBuyAgain(item)}
                              >
                                <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Buy Again</Text>
                              </Pressable>
                              {!reviewedOrderItemIds.has(item.id) && selectedOrder.status === 'completed' ? (
                                <Pressable
                                  style={[styles.primaryButton, styles.itemActionButton, { backgroundColor: theme.colors.primary }]}
                                  onPress={() => {
                                    setSelectedOrder(null);
                                    openReviewModal(selectedOrder, item);
                                  }}
                                >
                                  <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Review</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={[styles.modalSection, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                  <View style={styles.modalSectionHeader}>
                    <View style={styles.modalSectionTitleRow}>
                      <Text style={[styles.modalSectionTitle, { color: theme.colors.text }]}>Actions</Text>
                      {isOrderTrackable(selectedOrder.status) ? (
                        <Pressable
                          style={[styles.inlineTrackButton, { backgroundColor: `${theme.colors.primary}1A`, borderColor: `${theme.colors.primary}66` }]}
                          onPress={async () => {
                            const nextOrder = selectedOrder;
                            setSelectedOrder(null);
                            await openTrackingModal(nextOrder);
                          }}
                        >
                          <Text style={[styles.inlineTrackButtonText, { color: theme.colors.primary }]}>Track</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.actionsGrid}>
                    {!isOrderTrackable(selectedOrder.status) ? (
                      <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Tracking opens once order is shipped.</Text>
                    ) : null}

                    {selectedOrder.status === 'pending' ? (
                      <Pressable
                        style={[styles.secondaryButton, styles.actionButton, { borderColor: theme.colors.danger, backgroundColor: `${theme.colors.danger}1A` }]}
                        onPress={async () => {
                          try {
                            await cancelCustomerOrder(selectedOrder.id, 'Cancelled by customer');
                            setSelectedOrder(null);
                            await loadOrders();
                          } catch (error) {
                            showAlert({
                              title: 'Cancel failed',
                              message: error instanceof Error ? error.message : 'Unable to cancel this order.',
                              tone: 'error',
                            });
                          }
                        }}
                      >
                        <Text style={[styles.secondaryButtonText, { color: theme.colors.danger }]}>Cancel</Text>
                      </Pressable>
                    ) : null}

                    {selectedOrder.status === 'delivered' ? (
                      <Pressable
                        style={[styles.primaryButton, styles.actionButton, { backgroundColor: theme.colors.success }]}
                        onPress={async () => {
                          try {
                            await markOrderCompleted(selectedOrder.id);
                            setSelectedOrder(null);
                            await loadOrders();
                          } catch (error) {
                            showAlert({
                              title: 'Unable to confirm',
                              message: error instanceof Error ? error.message : 'Unable to mark order as received.',
                              tone: 'error',
                            });
                          }
                        }}
                      >
                        <Text style={[styles.primaryButtonText, { color: '#052E16' }]}>Order Received</Text>
                      </Pressable>
                    ) : null}

                    {canRequestRefund(selectedOrder) ? (
                      <Pressable
                        style={[styles.secondaryButton, styles.actionButton, { borderColor: theme.colors.warning ?? '#F59E0B', backgroundColor: `${theme.colors.warning ?? '#F59E0B'}1A` }]}
                        onPress={() => {
                          setRefundOrder(selectedOrder);
                          setRefundReason('');
                          setRefundNote('');
                          setRefundEvidenceUrls([]);
                          setSelectedOrder(null);
                        }}
                      >
                        <Text style={[styles.secondaryButtonText, { color: theme.colors.warning ?? '#F59E0B' }]}>Refund</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </ModalBackdrop>
      </Modal>

      <Modal
        visible={Boolean(trackingOrder)}
        transparent
        animationType="slide"
        onRequestClose={closeTrackingModal}
      >
        <ModalBackdrop align="flex-end" overlayOpacity={0.42}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <View style={styles.modalTitleRow}>
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Track Package</Text>
              <Pressable style={styles.modalIconCloseButton} onPress={closeTrackingModal} hitSlop={8}>
                <Ionicons name="close" size={15} color="#FFFFFF" />
              </Pressable>
            </View>
            {trackingOrder ? (
              <View style={[styles.trackingSummaryCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                <Text style={[styles.trackingSummaryTitle, { color: theme.colors.text }]} numberOfLines={1}>
                  {trackingOrder.orderNo}
                </Text>
                <Text style={[styles.trackingSummaryMeta, { color: orderStatusColor(trackingOrder.status) }]}>
                  {STATUS_LABEL[trackingOrder.status]}
                </Text>
                <Text style={[styles.trackingSummaryMeta, { color: theme.colors.textMuted }]} numberOfLines={2}>
                  {trackingOrder.deliveryAddress || 'No saved delivery address'}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={[
                styles.secondaryButton,
                styles.trackingMapToggleButton,
                {
                  borderColor: trackingMapVisible ? theme.colors.primary : theme.colors.border,
                  backgroundColor: trackingMapVisible ? theme.colors.primary : theme.colors.surfaceAlt,
                },
              ]}
              onPress={() => setTrackingMapVisible((prev) => !prev)}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: trackingMapVisible ? theme.colors.primaryContrast : theme.colors.text },
                ]}
              >
                {trackingMapVisible ? 'Hide Live Map' : 'Show Live Map'}
              </Text>
            </Pressable>
            {trackingMapVisible ? (
              <TrackingMap
                coordinates={trackingMapCoordinates}
                origin={trackingOrigin}
                destination={trackingDestination}
                routeCoordinates={trackingRouteCoordinates}
                routeColor={trackingOrder && ['completed', 'delivered'].includes(trackingOrder.status) ? '#22C55E' : '#F97316'}
              />
            ) : null}
            {trackingMapVisible && trackingRouteDistanceKm !== null ? (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
                Road route distance: {trackingRouteDistanceKm.toFixed(2)} km
              </Text>
            ) : null}
            {trackingMapVisible && trackingDestination && trackingRouteDistanceKm === null ? (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
                Road route is still loading. Keep map open for route refresh.
              </Text>
            ) : null}
            {trackingBusy ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading latest tracking data...</Text> : null}
            {!trackingMapCoordinates.length && !trackingDestination ? (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
                Live location updates will appear after dispatch.
              </Text>
            ) : null}
            <Pressable
              style={[styles.supportCard, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}
              onPress={openSupportHotline}
            >
              <View style={[styles.supportIconWrap, { backgroundColor: `${theme.colors.primary}22` }]}>
                <Ionicons name="call-outline" size={16} color={theme.colors.primary} />
              </View>
              <View style={styles.supportCopy}>
                <Text style={[styles.supportTitle, { color: theme.colors.text }]}>Need urgent help?</Text>
                <Text style={[styles.supportNumber, { color: theme.colors.primary }]}>
                  Contact support: {SUPPORT_CONTACT_NUMBER}
                </Text>
              </View>
            </Pressable>
            <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent}>
              {trackingEvents.map((event) => (
                <View key={event.id} style={styles.timelineItem}>
                  <Text style={[styles.timelineTitle, { color: theme.colors.text }]}>{event.title}</Text>
                  <Text style={[styles.timelineMeta, { color: theme.colors.textMuted }]}>{formatDateTime(event.eventAt)}</Text>
                  {event.description ? (
                    <Text style={[styles.timelineMeta, { color: theme.colors.textMuted }]}>{event.description}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>

      <Modal
        visible={Boolean(refundOrder)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setRefundOrder(null);
          setRefundUploadProgress(null);
        }}
      >
        <ModalBackdrop align="flex-end" overlayOpacity={0.42}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Request Refund</Text>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Reason *</Text>
            <TextInput
              value={refundReason}
              onChangeText={setRefundReason}
              placeholder="Reason (required)"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Details</Text>
            <TextInput
              value={refundNote}
              onChangeText={setRefundNote}
              multiline
              placeholder="Tell us what happened. Attach clear photos and unboxing proof."
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                styles.multiline,
                { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
              ]}
            />
            <Pressable
              style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
              onPress={async () => {
                if (refundEvidenceUrls.length >= 5) {
                  showAlert({
                    title: 'Image limit reached',
                    message: 'You can upload up to 5 photos.',
                    tone: 'info',
                  });
                  return;
                }

                try {
                  setRefundUploadProgress({ completed: 0, total: Math.max(1, 5 - refundEvidenceUrls.length) });
                  const urls = await pickAndUploadImages({
                    bucket: 'review-media',
                    folder: `refunds/${refundOrder?.id ?? 'temp'}`,
                    maxImages: Math.max(1, 5 - refundEvidenceUrls.length),
                    onProgress: (progress) => setRefundUploadProgress(progress),
                  });
                  if (urls.length) {
                    setRefundEvidenceUrls((prev) => Array.from(new Set([...prev, ...urls])).slice(0, 5));
                  }
                } catch (error) {
                  showAlert({
                    title: 'Upload failed',
                    message: error instanceof Error ? error.message : 'Unable to upload photos.',
                    tone: 'error',
                  });
                } finally {
                  setRefundUploadProgress(null);
                }
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                Attach Photos ({refundEvidenceUrls.length}/5)
              </Text>
            </Pressable>
            {refundUploadProgress ? (
              <Text style={[styles.uploadProgressText, { color: theme.colors.textMuted }]}>
                Uploading {Math.min(refundUploadProgress.completed, refundUploadProgress.total)}/{refundUploadProgress.total}...
              </Text>
            ) : null}
            {refundEvidenceUrls.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewImageRow}>
                {refundEvidenceUrls.map((uri, index) => (
                  <Pressable key={`refund-${index}`} onPress={() => openImagePreview(refundEvidenceUrls, index)}>
                    <Image source={{ uri }} style={styles.previewImageThumb} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                onPress={() => {
                  setRefundOrder(null);
                  setRefundUploadProgress(null);
                }}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                onPress={async () => {
                  if (!refundOrder) {
                    return;
                  }
                  try {
                    await requestOrderRefund({
                      orderId: refundOrder.id,
                      reason: refundReason.trim(),
                      note: refundNote.trim(),
                      evidenceUrls: refundEvidenceUrls,
                    });
                    setRefundOrder(null);
                    setRefundUploadProgress(null);
                    await loadOrders();
                  } catch (error) {
                    showAlert({
                      title: 'Refund request failed',
                      message: error instanceof Error ? error.message : 'Unable to request refund.',
                      tone: 'error',
                    });
                  }
                }}
              >
                <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </ModalBackdrop>
      </Modal>

      <Modal
        visible={Boolean(reviewOrder && reviewItem)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setReviewOrder(null);
          setReviewItem(null);
          setReviewUploadProgress(null);
        }}
      >
        <ModalBackdrop align="flex-end" overlayOpacity={0.42}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Write Review</Text>
            <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{reviewItem?.productName}</Text>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Product Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={`product-${value}`} onPress={() => setReviewRating(value)}>
                  <Text style={[styles.star, { color: value <= reviewRating ? '#F59E0B' : theme.colors.textMuted }]}>?</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Rider Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={`rider-${value}`} onPress={() => setRiderRating(value)}>
                  <Text style={[styles.star, { color: value <= riderRating ? '#F59E0B' : theme.colors.textMuted }]}>?</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Comment</Text>
            <TextInput
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              placeholder="Share your experience"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                styles.multiline,
                { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
              ]}
            />
            <Pressable
              style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
              onPress={async () => {
                if (reviewImageUrls.length >= 5) {
                  showAlert({
                    title: 'Image limit reached',
                    message: 'You can upload up to 5 photos.',
                    tone: 'info',
                  });
                  return;
                }

                try {
                  setReviewUploadProgress({ completed: 0, total: Math.max(1, 5 - reviewImageUrls.length) });
                  const urls = await pickAndUploadImages({
                    bucket: 'review-media',
                    folder: `reviews/${reviewOrder?.id ?? 'temp'}`,
                    maxImages: Math.max(1, 5 - reviewImageUrls.length),
                    onProgress: (progress) => setReviewUploadProgress(progress),
                  });
                  if (urls.length) {
                    setReviewImageUrls((prev) => Array.from(new Set([...prev, ...urls])).slice(0, 5));
                  }
                } catch (error) {
                  showAlert({
                    title: 'Upload failed',
                    message: error instanceof Error ? error.message : 'Unable to upload review photos.',
                    tone: 'error',
                  });
                } finally {
                  setReviewUploadProgress(null);
                }
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                Attach Photos ({reviewImageUrls.length}/5)
              </Text>
            </Pressable>
            {reviewUploadProgress ? (
              <Text style={[styles.uploadProgressText, { color: theme.colors.textMuted }]}>
                Uploading {Math.min(reviewUploadProgress.completed, reviewUploadProgress.total)}/{reviewUploadProgress.total}...
              </Text>
            ) : null}
            {reviewImageUrls.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewImageRow}>
                {reviewImageUrls.map((uri, index) => (
                  <Pressable key={`review-${index}`} onPress={() => openImagePreview(reviewImageUrls, index)}>
                    <Image source={{ uri }} style={styles.previewImageThumb} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                onPress={() => {
                  setReviewOrder(null);
                  setReviewItem(null);
                  setReviewUploadProgress(null);
                }}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                onPress={async () => {
                  if (!reviewOrder || !reviewItem || !profile?.id) {
                    return;
                  }
                  try {
                    await submitProductReview({
                      orderId: reviewOrder.id,
                      orderItemId: reviewItem.id,
                      productId: reviewItem.productId,
                      customerId: profile.id,
                      rating: reviewRating,
                      comment: reviewComment.trim(),
                      imageUrls: reviewImageUrls,
                    });
                    await submitRiderReview({
                      orderId: reviewOrder.id,
                      customerId: profile.id,
                      rating: riderRating,
                      comment: reviewComment.trim(),
                    });
                    setReviewOrder(null);
                    setReviewItem(null);
                    setReviewImageUrls([]);
                    setReviewUploadProgress(null);
                    await loadOrders();
                    showAlert({
                      title: 'Review submitted',
                      message: 'Thank you for sharing your feedback.',
                      tone: 'success',
                    });
                  } catch (error) {
                    showAlert({
                      title: 'Review failed',
                      message: error instanceof Error ? error.message : 'Unable to submit review.',
                      tone: 'error',
                    });
                  }
                }}
              >
                <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </ModalBackdrop>
      </Modal>

      <ImagePreviewModal
        visible={previewVisible}
        images={previewImages}
        initialIndex={previewIndex}
        onClose={() => setPreviewVisible(false)}
      />

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
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
  guestWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 14,
  },
  loginButton: {
    borderRadius: 999,
    marginTop: 14,
    paddingVertical: 14,
  },
  loginButtonText: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  helper: {
    marginTop: 10,
  },
  pendingReviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  pendingReviewTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  pendingReviewSub: {
    fontSize: 12,
    marginTop: 4,
  },
  pendingReviewList: {
    gap: 8,
    marginTop: 10,
  },
  pendingReviewRow: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    padding: 10,
  },
  pendingReviewInfo: {
    flex: 1,
    minWidth: 0,
  },
  pendingReviewItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  pendingReviewMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  pendingReviewActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  list: {
    gap: 10,
    marginTop: 12,
  },
  skeletonList: {
    gap: 8,
    marginTop: 10,
  },
  skeletonCard: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  skeletonLine: {
    borderRadius: 999,
    height: 10,
    width: '100%',
  },
  skeletonLineShort: {
    width: '42%',
  },
  skeletonLineTiny: {
    width: '28%',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderNo: {
    fontSize: 15,
    fontWeight: '800',
  },
  orderStatus: {
    fontSize: 11,
    fontWeight: '700',
  },
  orderStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  orderStatusBadgeStrong: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  orderStatusBadgeStrongText: {
    fontSize: 11,
    fontWeight: '800',
  },
  meta: {
    fontSize: 11,
    marginTop: 4,
  },
  modalBody: {
    marginTop: 10,
  },
  modalBodyContent: {
    gap: 14,
    paddingBottom: 10,
  },
  detailTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailMetaCard: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  detailMetaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  detailMetaLabel: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 58,
  },
  detailMetaValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },
  orderPreviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  itemsWrap: {
    marginTop: 8,
    rowGap: 6,
  },
  orderItemRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  orderItemImage: {
    borderRadius: 8,
    height: 34,
    width: 34,
  },
  orderItemImageFallback: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  orderItemImageFallbackText: {
    fontSize: 9,
    fontWeight: '700',
  },
  itemRow: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    minWidth: 0,
  },
  itemDetailWrap: {
    flex: 1,
    minWidth: 0,
  },
  orderItemMainRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  orderItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  orderItemActionsCol: {
    alignItems: 'flex-end',
    gap: 6,
    justifyContent: 'flex-start',
  },
  itemActionButton: {
    minWidth: 88,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  progressTrack: {
    borderRadius: 999,
    flex: 1,
    height: 6,
    overflow: 'visible',
  },
  progressFill: {
    borderRadius: 999,
    height: 6,
    minWidth: 4,
    position: 'relative',
  },
  progressRiderIcon: {
    borderRadius: 999,
    height: 44,
    position: 'absolute',
    right: -22,
    top: -19,
    width: 44,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  progressStageLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5,
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  actionButton: {
    minWidth: 92,
  },
  trackingSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  trackingSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  trackingSummaryMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  paginationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
  },
  paginationButton: {
    minWidth: 104,
  },
  paginationLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 90,
    textAlign: 'center',
  },
  reviewActions: {
    gap: 8,
    marginTop: 8,
  },
  reviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  reviewRowImage: {
    borderRadius: 7,
    height: 30,
    width: 30,
  },
  reviewRowImageFallback: {
    borderRadius: 7,
    height: 30,
    width: 30,
  },
  reviewItemName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 0,
  },
  reviewRowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  reviewedBadge: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reviewedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
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
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '84%',
    padding: 14,
  },
  modalTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  modalIconCloseButton: {
    alignItems: 'center',
    backgroundColor: '#DC2626',
    boxShadow: '0px 4px 12px rgba(220, 38, 38, 0.28)',
    borderColor: '#FCA5A5',
    borderRadius: 999,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  modalSection: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 10,
  },
  modalSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
    width: '100%',
  },
  modalSectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  inlineTrackButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inlineTrackButtonText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modalSectionList: {
    gap: 8,
    marginTop: 8,
    paddingBottom: 2,
  },
  trackingMapToggleButton: {
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  map: {
    borderRadius: 12,
    height: 200,
    marginTop: 10,
    width: '100%',
  },
  supportCard: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  supportIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  supportCopy: {
    flex: 1,
    minWidth: 0,
  },
  supportTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  supportNumber: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  timeline: {
    marginTop: 12,
    maxHeight: 220,
  },
  timelineContent: {
    paddingBottom: 2,
  },
  timelineItem: {
    marginBottom: 14,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  timelineMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  uploadProgressText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  previewImageRow: {
    gap: 8,
    marginTop: 8,
  },
  previewImageThumb: {
    borderRadius: 8,
    height: 62,
    width: 62,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  star: {
    fontSize: 22,
    fontWeight: '800',
  },
});

