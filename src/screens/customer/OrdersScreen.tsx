import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
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

import { BrandedLoader } from '../../components/BrandedLoader';
import { EmptyState } from '../../components/EmptyState';
import { BrandAlertModal } from '../../components/BrandAlertModal';
import { ImagePreviewModal } from '../../components/ImagePreviewModal';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useMinimumLoader } from '../../hooks/useMinimumLoader';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { buildAddressQuery, fetchDrivingRoute, geocodeAddress, getStoreCoordinates } from '../../services/geocodingService';
import { pickAndUploadImages } from '../../services/mediaService';
import {
  cancelCustomerOrder,
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
import { Order, OrderItem, OrderTrackingEvent } from '../../types/models';
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
  const addressTokens = order.deliveryAddress
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const fallbacks = [
    buildAddressQuery([order.deliveryAddress, 'Philippines']),
    buildAddressQuery([order.deliveryArea, 'Philippines']),
    buildAddressQuery(addressTokens.slice(-4)),
    buildAddressQuery(addressTokens.slice(-3)),
    buildAddressQuery(addressTokens.slice(-2)),
    buildAddressQuery(['Philippines']),
  ];

  return [...new Set(fallbacks.filter(Boolean))];
}

export function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const addToCart = useCartStore((state) => state.addItem);
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviewedOrderItemIds, setReviewedOrderItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<OrderTrackingEvent[]>([]);
  const [trackingDestination, setTrackingDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [trackingRouteCoordinates, setTrackingRouteCoordinates] = useState<Array<{ latitude: number; longitude: number }>>([]);
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
  const showLoader = useMinimumLoader(loading, 6000);

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
  const trackingMapCoordinates = useMemo(() => {
    if (trackingCoordinates.length) {
      return trackingCoordinates;
    }

    return trackingLatestPoint ? [trackingLatestPoint] : [];
  }, [trackingCoordinates, trackingLatestPoint]);

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
    const timer = setInterval(refresh, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [trackingOrder]);

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
      <Text style={[styles.title, { color: theme.colors.text }]}>Order History</Text>
      {showLoader ? <BrandedLoader compact label="Loading transactions..." /> : null}

      {!loading && !orders.length ? (
        <EmptyState title="No transactions yet" subtitle="Your completed checkout orders will appear here." />
      ) : null}

      {!loading && pendingReviewItems.length ? (
        <View style={[styles.pendingReviewCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
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
        {orders.map((order) => (
          <View key={order.id} style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.orderNo, { color: theme.colors.text }]}>{order.orderNo}</Text>
              <Text style={[styles.orderStatus, { color: theme.colors.accent }]}>{STATUS_LABEL[order.status]}</Text>
            </View>

            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{formatDateTime(order.createdAt)}</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              Shipping: {order.shippingMethodName || 'Suki Send Rider'}
            </Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={2}>
              Address: {order.deliveryAddress}
            </Text>

            <View style={styles.itemsWrap}>
              {order.items.slice(0, 3).map((item) => (
                <View key={item.id} style={styles.orderItemRow}>
                  {item.productImageUrl ? (
                    <Image source={{ uri: item.productImageUrl }} style={styles.orderItemImage} />
                  ) : (
                    <View style={[styles.orderItemImageFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                      <Text style={[styles.orderItemImageFallbackText, { color: theme.colors.textMuted }]}>IMG</Text>
                    </View>
                  )}
                  <Text style={[styles.itemRow, { color: theme.colors.text }]} numberOfLines={2}>
                    {item.productName}
                    {item.variantValue ? ` (${item.variantValue})` : ''} x{item.quantity}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>COD Total</Text>
              <Text style={[styles.totalValue, { color: theme.colors.primary }]}>{formatPHP(order.total)}</Text>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                onPress={async () => {
                  try {
                    setTrackingOrder(order);
                    setTrackingEvents([]);
                    setTrackingDestination(null);
                    setTrackingRouteCoordinates([]);
                    const eventsPromise = fetchOrderTrackingEvents(order.id);
                    const destinationPromise = (async () => {
                      const candidates = getTrackingAddressCandidates(order);
                      for (const query of candidates) {
                        const point = await geocodeAddress(query);
                        if (point) {
                          return point;
                        }
                      }
                      return null;
                    })();
                    const [events, destination] = await Promise.all([eventsPromise, destinationPromise]);
                    setTrackingEvents(events);
                    setTrackingDestination(
                      destination ? { latitude: destination.latitude, longitude: destination.longitude } : null,
                    );
                    if (destination) {
                      const route = await fetchDrivingRoute(trackingOrigin, destination);
                      setTrackingRouteCoordinates(route?.coordinates ?? []);
                    }
                  } catch {
                    showAlert({
                      title: 'Tracking unavailable',
                      message: 'No tracking events available yet.',
                      tone: 'info',
                    });
                  }
                }}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Track</Text>
              </Pressable>

              {order.status === 'pending' ? (
                <Pressable
                  style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                  onPress={async () => {
                    try {
                      await cancelCustomerOrder(order.id, 'Cancelled by customer');
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
                  <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Cancel</Text>
                </Pressable>
              ) : null}

              {order.status === 'delivered' ? (
                <Pressable
                  style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                  onPress={async () => {
                    try {
                      await markOrderCompleted(order.id);
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
                  <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Order Received</Text>
                </Pressable>
              ) : null}

              {canRequestRefund(order) ? (
                <Pressable
                  style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                  onPress={() => {
                    setRefundOrder(order);
                    setRefundReason('');
                    setRefundNote('');
                    setRefundEvidenceUrls([]);
                  }}
                >
                  <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Refund</Text>
                </Pressable>
              ) : null}
            </View>

            {order.status === 'completed' ? (
              <View style={styles.reviewActions}>
                {order.items.map((item) => (
                  <View key={item.id} style={styles.reviewRow}>
                    {item.productImageUrl ? (
                      <Image source={{ uri: item.productImageUrl }} style={styles.reviewRowImage} />
                    ) : (
                      <View style={[styles.reviewRowImageFallback, { backgroundColor: theme.colors.surfaceAlt }]} />
                    )}
                    <Text style={[styles.reviewItemName, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <View style={styles.reviewRowActions}>
                      <Pressable
                        style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                        onPress={() => handleBuyAgain(item)}
                      >
                        <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Buy Again</Text>
                      </Pressable>
                      {!reviewedOrderItemIds.has(item.id) ? (
                        <Pressable
                          style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
                          onPress={() => openReviewModal(order, item)}
                        >
                          <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Review</Text>
                        </Pressable>
                      ) : (
                        <View style={[styles.reviewedBadge, { borderColor: theme.colors.border }]}>
                          <Text style={[styles.reviewedBadgeText, { color: theme.colors.textMuted }]}>Reviewed</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <Modal
        visible={Boolean(trackingOrder)}
        transparent
        animationType="slide"
      onRequestClose={() => {
        setTrackingOrder(null);
        setTrackingDestination(null);
        setTrackingRouteCoordinates([]);
      }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Track Package</Text>
            <TrackingMap
              coordinates={trackingMapCoordinates}
              origin={trackingOrigin}
              destination={trackingDestination}
              routeCoordinates={trackingRouteCoordinates}
            />
            {!trackingMapCoordinates.length && !trackingDestination ? (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>
                Live location updates will appear after dispatch.
              </Text>
            ) : null}
            <ScrollView style={styles.timeline}>
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
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => {
                setTrackingOrder(null);
                setTrackingDestination(null);
                setTrackingRouteCoordinates([]);
              }}
            >
              <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Close</Text>
            </Pressable>
          </View>
        </View>
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
        <View style={styles.modalOverlay}>
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
        </View>
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Write Review</Text>
            <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{reviewItem?.productName}</Text>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Product Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={`product-${value}`} onPress={() => setReviewRating(value)}>
                  <Text style={[styles.star, { color: value <= reviewRating ? '#F59E0B' : theme.colors.textMuted }]}>★</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Rider Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={`rider-${value}`} onPress={() => setRiderRating(value)}>
                  <Text style={[styles.star, { color: value <= riderRating ? '#F59E0B' : theme.colors.textMuted }]}>★</Text>
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
        </View>
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
    marginTop: 8,
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
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
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
    fontSize: 12,
    fontWeight: '700',
  },
  meta: {
    fontSize: 12,
    marginTop: 4,
  },
  itemsWrap: {
    marginTop: 8,
    rowGap: 6,
  },
  orderItemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  orderItemImage: {
    borderRadius: 8,
    height: 38,
    width: 38,
  },
  orderItemImageFallback: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
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
    fontSize: 16,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
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
    fontSize: 13,
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
    fontSize: 13,
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
    maxHeight: '88%',
    padding: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
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
  timeline: {
    marginTop: 10,
  },
  timelineItem: {
    marginBottom: 10,
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
