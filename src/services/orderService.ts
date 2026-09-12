import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';

import { supabase } from '../lib/supabase';
import { CartItem, Order, OrderTrackingEvent } from '../types/models';
import { mockTransactions } from '../data/mockData';
import { mapRowToOrder } from './mappers';

const ORDERS_CACHE_KEY = 'suki_cached_orders';
const ORDERS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedOrders {
  customerId: string;
  orders: Order[];
  cachedAt: number;
}

export async function createCodOrder(input: {
  customerId: string;
  addressId: string;
  shippingMethodId: string | null;
  items: CartItem[];
  customerNote?: string;
  deliveryFee?: number;
}) {
  if (!supabase) {
    return `MOCK-${dayjs().format('HHmmss')}`;
  }

  const payload = input.items.map((item) => ({
    product_id: item.product.id,
    quantity: item.quantity,
    variant_id: item.variantId ?? null,
  }));

  const rpcArgs = {
    p_customer_id: input.customerId,
    p_address_id: input.addressId,
    p_shipping_method_id: input.shippingMethodId,
    p_items: payload,
    p_customer_note: input.customerNote ?? null,
    p_delivery_fee: Number.isFinite(input.deliveryFee) ? Number(input.deliveryFee) : null,
  };

  const { data, error } = await supabase.rpc('create_cod_order', rpcArgs);

  if (error) {
    if (String(error.message ?? '').toLowerCase().includes('p_delivery_fee')) {
      throw new Error('Checkout function in Supabase is outdated. Run supabase/fix_checkout.sql and retry.');
    }
    const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
    throw new Error(parts.join(' | '));
  }

  return String(data);
}

export async function fetchCustomerOrders(customerId: string): Promise<Order[]> {
  if (!supabase) {
    return mockTransactions.filter((transaction) => transaction.customerId === customerId || customerId === 'customer-demo');
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_no,
        customer_id,
        status,
        payment_method,
        payment_status,
        shipping_method_id,
        shipping_method_name,
        tracking_number,
        delivery_area,
        delivery_address,
        customer_note,
        expected_delivery_start,
        expected_delivery_end,
        latest_lat,
        latest_lng,
        approved_at,
        shipped_at,
        delivered_at,
        completed_at,
        cancelled_at,
        cancel_reason,
        refunded_at,
        refund_deadline_at,
        subtotal,
        delivery_fee,
        total,
        created_at,
        order_items (
          id,
          product_id,
          variant_id,
          variant_name,
          variant_value,
          product_name,
          sku,
          unit_price,
          quantity,
          line_total,
          products (
            image_url,
            product_images ( image_url, sort_order )
          )
        )
      `,
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const orders = (data ?? []).map(mapRowToOrder);

    try {
      const cacheData: CachedOrders = { customerId, orders, cachedAt: Date.now() };
      await AsyncStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(cacheData));
    } catch {}

    return orders;
  } catch (error) {
    try {
      const raw = await AsyncStorage.getItem(ORDERS_CACHE_KEY);
      if (raw) {
        const cached: CachedOrders = JSON.parse(raw);
        if (cached.customerId === customerId && Date.now() - cached.cachedAt < ORDERS_CACHE_TTL_MS * 24) {
          return cached.orders;
        }
      }
    } catch {}

    throw error;
  }
}

export async function fetchReviewedOrderItemIds(customerId: string): Promise<string[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('product_reviews')
    .select('order_item_id')
    .eq('customer_id', customerId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => String(row.order_item_id));
}

export async function fetchOrderTrackingEvents(orderId: string): Promise<OrderTrackingEvent[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('order_status_history')
    .select('id, order_id, status, title, description, latitude, longitude, event_at')
    .eq('order_id', orderId)
    .order('event_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    title: row.title,
    description: row.description ?? undefined,
    latitude: row.latitude === null ? undefined : Number(row.latitude),
    longitude: row.longitude === null ? undefined : Number(row.longitude),
    eventAt: row.event_at,
  }));
}

export async function cancelCustomerOrder(orderId: string, reason?: string) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.rpc('customer_cancel_order', {
    p_order_id: orderId,
    p_reason: reason ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function markOrderCompleted(orderId: string) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.rpc('customer_mark_order_completed', {
    p_order_id: orderId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function requestOrderRefund(input: {
  orderId: string;
  reason: string;
  note?: string;
  evidenceUrls?: string[];
}) {
  if (!supabase) {
    throw new Error('Refunds require Supabase.');
  }

  const { data, error } = await supabase.rpc('customer_request_refund', {
    p_order_id: input.orderId,
    p_reason: input.reason,
    p_note: input.note ?? null,
    p_evidence_urls: input.evidenceUrls ?? [],
  });
  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}
