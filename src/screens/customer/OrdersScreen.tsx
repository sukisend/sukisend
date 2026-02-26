import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import {
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
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { CustomerStackParamList } from '../../navigation/types';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { buildAddressQuery, geocodeAddress, getStoreCoordinates } from '../../services/geocodingService';
import { pickAndUploadImages } from '../../services/mediaService';
import {
  cancelCustomerOrder,
  fetchCustomerOrders,
  fetchOrderTrackingEvents,
  markOrderCompleted,
  requestOrderRefund,
  submitProductReview,
  submitRiderReview,
} from '../../services/productService';
import { Order, OrderItem, OrderTrackingEvent } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';

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

export function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NativeStackNavigationProp<CustomerStackParamList>>();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);
  const [trackingEvents, setTrackingEvents] = useState<OrderTrackingEvent[]>([]);
  const [trackingDestination, setTrackingDestination] = useState<{ latitude: number; longitude: number } | null>(null);
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

  const loadOrders = useCallback(async () => {
    if (!profile?.id) {
      setOrders([]);
      return;
    }

    setLoading(true);
    try {
      const nextOrders = await fetchCustomerOrders(profile.id);
      setOrders(nextOrders);
    } catch {
      setOrders([]);
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
      .filter((item) => item.latitude !== undefined && item.longitude !== undefined)
      .map((item) => ({
        latitude: item.latitude as number,
        longitude: item.longitude as number,
      }));
    return coords;
  }, [trackingEvents]);
  const trackingOrigin = useMemo(() => getStoreCoordinates(), []);

  if (role === 'guest') {
    return (
      <View
        style={[
          styles.guestWrap,
          { backgroundColor: theme.colors.background, paddingBottom: tabBarHeight + 20, paddingTop: insets.top + 10 },
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
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 22, paddingTop: insets.top + 10 }]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>Order History</Text>
      {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading transactions...</Text> : null}

      {!loading && !orders.length ? (
        <EmptyState title="No transactions yet" subtitle="Your completed checkout orders will appear here." />
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
                <Text key={item.id} style={[styles.itemRow, { color: theme.colors.text }]}>
                  {item.productName}
                  {item.variantValue ? ` (${item.variantValue})` : ''} x{item.quantity}
                </Text>
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
                    const [events, primaryDestination] = await Promise.all([
                      fetchOrderTrackingEvents(order.id),
                      geocodeAddress(buildAddressQuery([order.deliveryAddress, 'Philippines'])),
                    ]);
                    const destination =
                      primaryDestination ??
                      (await geocodeAddress(buildAddressQuery([order.deliveryArea, 'Philippines'])));
                    setTrackingEvents(events);
                    setTrackingDestination(
                      destination ? { latitude: destination.latitude, longitude: destination.longitude } : null,
                    );
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
                  <Pressable
                    key={item.id}
                    style={[styles.secondaryButton, { borderColor: theme.colors.border }]}
                    onPress={() => {
                      setReviewOrder(order);
                      setReviewItem(item);
                      setReviewRating(5);
                      setRiderRating(5);
                      setReviewComment('');
                      setReviewImageUrls([]);
                    }}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Review {item.productName}</Text>
                  </Pressable>
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
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Track Package</Text>
            {trackingCoordinates.length || trackingDestination ? (
              <TrackingMap coordinates={trackingCoordinates} origin={trackingOrigin} destination={trackingDestination} />
            ) : (
              <Text style={[styles.helper, { color: theme.colors.textMuted }]}>No map coordinates yet for this order.</Text>
            )}
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
              }}
            >
              <Text style={[styles.primaryButtonText, { color: theme.colors.primaryContrast }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(refundOrder)} transparent animationType="slide" onRequestClose={() => setRefundOrder(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Request Refund</Text>
            <TextInput
              value={refundReason}
              onChangeText={setRefundReason}
              placeholder="Reason (required)"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
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
                try {
                  const urls = await pickAndUploadImages({
                    bucket: 'review-media',
                    folder: `refunds/${refundOrder?.id ?? 'temp'}`,
                    maxImages: 5,
                  });
                  setRefundEvidenceUrls(urls);
                } catch (error) {
                  showAlert({
                    title: 'Upload failed',
                    message: error instanceof Error ? error.message : 'Unable to upload photos.',
                    tone: 'error',
                  });
                }
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                Attach Photos ({refundEvidenceUrls.length}/5)
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable style={[styles.secondaryButton, { borderColor: theme.colors.border }]} onPress={() => setRefundOrder(null)}>
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

      <Modal visible={Boolean(reviewOrder && reviewItem)} transparent animationType="slide" onRequestClose={() => setReviewOrder(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Write Review</Text>
            <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{reviewItem?.productName}</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={`product-${value}`} onPress={() => setReviewRating(value)}>
                  <Text style={[styles.star, { color: value <= reviewRating ? '#F59E0B' : theme.colors.textMuted }]}>★</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Rider Rating</Text>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={`rider-${value}`} onPress={() => setRiderRating(value)}>
                  <Text style={[styles.star, { color: value <= riderRating ? '#F59E0B' : theme.colors.textMuted }]}>★</Text>
                </Pressable>
              ))}
            </View>
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
                try {
                  const urls = await pickAndUploadImages({
                    bucket: 'review-media',
                    folder: `reviews/${reviewOrder?.id ?? 'temp'}`,
                    maxImages: 5,
                  });
                  setReviewImageUrls(urls);
                } catch (error) {
                  showAlert({
                    title: 'Upload failed',
                    message: error instanceof Error ? error.message : 'Unable to upload review photos.',
                    tone: 'error',
                  });
                }
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                Attach Photos ({reviewImageUrls.length}/5)
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable style={[styles.secondaryButton, { borderColor: theme.colors.border }]} onPress={() => setReviewOrder(null)}>
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
    rowGap: 2,
  },
  itemRow: {
    fontSize: 13,
    fontWeight: '600',
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
