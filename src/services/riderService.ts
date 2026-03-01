import { mockTransactions } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types/models';

function mapRpcRowToOrder(row: any): Order {
  const rawItems = Array.isArray(row.order_items_json) ? row.order_items_json : [];
  return {
    id: row.id,
    orderNo: row.order_no,
    customerId: row.customer_id,
    status: row.status,
    paymentMethod: 'COD',
    paymentStatus: row.payment_status ?? 'unpaid',
    shippingMethodName: row.shipping_method_name ?? undefined,
    deliveryArea: row.delivery_area ?? '',
    deliveryAddress: row.delivery_address ?? '',
    latestLat: row.latest_lat === null ? undefined : Number(row.latest_lat),
    latestLng: row.latest_lng === null ? undefined : Number(row.latest_lng),
    total: Number(row.total ?? 0),
    subtotal: Number(row.subtotal ?? 0),
    deliveryFee: Number(row.delivery_fee ?? 0),
    createdAt: row.created_at,
    items: rawItems.map((item: any) => ({
      id: String(item.id ?? ''),
      productId: String(item.product_id ?? ''),
      variantId: item.variant_id ?? undefined,
      variantName: item.variant_name ?? undefined,
      variantValue: item.variant_value ?? undefined,
      productName: String(item.product_name ?? 'Product'),
      productImageUrl: item.product_image_url ?? undefined,
      sku: item.sku ?? undefined,
      unitPrice: Number(item.unit_price ?? 0),
      quantity: Number(item.quantity ?? 0),
      lineTotal: Number(item.line_total ?? 0),
    })),
  };
}

export async function fetchRiderActiveOrders(): Promise<Order[]> {
  if (!supabase) {
    return mockTransactions.filter((order) =>
      ['approved', 'shipped', 'out_for_delivery'].includes(order.status),
    );
  }

  const { data, error } = await supabase.rpc('rider_list_active_orders');
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRpcRowToOrder);
}

export async function riderUpdateOrderProgress(input: {
  orderId: string;
  nextStatus?: OrderStatus;
  note?: string;
  lat?: number;
  lng?: number;
}) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.rpc('rider_update_order_progress', {
    p_order_id: input.orderId,
    p_next_status: input.nextStatus ?? null,
    p_note: input.note ?? null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}
