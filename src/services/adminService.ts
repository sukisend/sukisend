import dayjs from 'dayjs';

import { mockProducts, mockTransactions } from '../data/mockData';
import { supabase } from '../lib/supabase';
import {
  Category,
  DashboardSnapshot,
  DateRange,
  Order,
  OrderStatus,
  Product,
  ProductSalesRank,
  SalesMetrics,
  SalesRangePreset,
  ShippingMethod,
} from '../types/models';
import { buildDateRange } from '../utils/date';

const localProducts = [...mockProducts];
const localOrders = [...mockTransactions];
let categoryIconColumnSupported: boolean | null = null;

function isMissingColumnError(message?: string) {
  return (message ?? '').toLowerCase().includes('column') && (message ?? '').toLowerCase().includes('icon');
}

function mapRowToProduct(row: any): Product {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const images = (row.product_images ?? [])
    .map((image: any) => ({
      id: image.id,
      productId: image.product_id,
      imageUrl: image.image_url,
      sortOrder: Number(image.sort_order ?? 0),
    }))
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  const variants = (row.product_variants ?? []).map((variant: any) => ({
    id: variant.id,
    productId: variant.product_id,
    name: variant.name,
    value: variant.value,
    priceDelta: Number(variant.price_delta ?? 0),
    stockOverride: variant.stock_override === null ? undefined : Number(variant.stock_override),
    isActive: Boolean(variant.is_active ?? true),
  }));

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    sku: row.sku ?? '',
    categoryId: row.category_id ?? category?.id ?? 'uncategorized',
    categoryName: category?.name ?? row.category_name ?? 'General',
    unit: row.unit ?? 'pcs',
    cost: Number(row.cost ?? 0),
    price: Number(row.price ?? 0),
    stock: Number(row.stock ?? 0),
    minStock: Number(row.min_stock ?? 0),
    imageUrl: images[0]?.imageUrl ?? row.image_url ?? undefined,
    images,
    variants,
    onSale: Boolean(row.on_sale ?? false),
    salePrice: row.sale_price === null ? undefined : Number(row.sale_price),
    sortPriority: Number(row.sort_priority ?? 0),
    isActive: Boolean(row.is_active ?? true),
  };
}

function mapRowToOrder(row: any): Order {
  return {
    id: row.id,
    orderNo: row.order_no,
    customerId: row.customer_id,
    status: row.status,
    paymentMethod: 'COD',
    paymentStatus: row.payment_status ?? 'unpaid',
    shippingMethodId: row.shipping_method_id ?? undefined,
    shippingMethodName: row.shipping_method_name ?? undefined,
    trackingNumber: row.tracking_number ?? undefined,
    deliveryArea: row.delivery_area ?? '',
    deliveryAddress: row.delivery_address ?? '',
    customerNote: row.customer_note ?? undefined,
    expectedDeliveryStart: row.expected_delivery_start ?? undefined,
    expectedDeliveryEnd: row.expected_delivery_end ?? undefined,
    latestLat: row.latest_lat === null ? undefined : Number(row.latest_lat),
    latestLng: row.latest_lng === null ? undefined : Number(row.latest_lng),
    approvedAt: row.approved_at ?? undefined,
    shippedAt: row.shipped_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
    refundedAt: row.refunded_at ?? undefined,
    refundDeadlineAt: row.refund_deadline_at ?? undefined,
    subtotal: Number(row.subtotal ?? 0),
    deliveryFee: Number(row.delivery_fee ?? 0),
    total: Number(row.total ?? 0),
    createdAt: row.created_at,
    items: (row.order_items ?? []).map((item: any) => ({
      id: item.id,
      productId: item.product_id,
      variantId: item.variant_id ?? undefined,
      variantName: item.variant_name ?? undefined,
      variantValue: item.variant_value ?? undefined,
      productName: item.product_name,
      sku: item.sku ?? '',
      unitPrice: Number(item.unit_price ?? 0),
      quantity: Number(item.quantity ?? 0),
      lineTotal: Number(item.line_total ?? 0),
    })),
  };
}

function mapRowToShippingMethod(row: any): ShippingMethod {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    baseFee: Number(row.base_fee ?? 0),
    etaMinDays: row.eta_min_days ?? undefined,
    etaMaxDays: row.eta_max_days ?? undefined,
    isActive: Boolean(row.is_active ?? true),
  };
}

function isInsideRange(dateValue: string, range: DateRange) {
  const date = dayjs(dateValue).valueOf();
  return date >= dayjs(range.start).valueOf() && date <= dayjs(range.end).valueOf();
}

function getActiveVariantStocks(product: Product) {
  return (product.variants ?? [])
    .filter((variant) => variant.isActive && Number.isFinite(variant.stockOverride))
    .map((variant) => Number(variant.stockOverride));
}

function countVariantLowStocks(product: Product) {
  return getActiveVariantStocks(product).filter((stock) => stock <= product.minStock).length;
}

function buildVariantLowStockItems(products: Product[]) {
  const rows: Product[] = [];

  for (const product of products) {
    for (const variant of product.variants ?? []) {
      if (!variant.isActive || !Number.isFinite(variant.stockOverride)) {
        continue;
      }

      const variantStock = Number(variant.stockOverride);
      if (variantStock > product.minStock) {
        continue;
      }

      rows.push({
        ...product,
        id: `${product.id}::${variant.id}`,
        name: `${product.name} (${variant.value})`,
        stock: variantStock,
      });
    }
  }

  return rows;
}

function buildMetrics(products: Product[], orders: Order[]): {
  metrics: SalesMetrics;
  topProducts: ProductSalesRank[];
  categorySales: { category: string; sales: number }[];
} {
  const paidOrders = orders.filter((order) => order.paymentStatus === 'paid' && ['delivered', 'completed'].includes(order.status));
  const grossSales = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = paidOrders.length;
  const averageOrderValue = totalOrders > 0 ? grossSales / totalOrders : 0;
  let profit = 0;

  const byProduct = new Map<string, ProductSalesRank>();
  const byCategory = new Map<string, number>();
  const productById = new Map(products.map((product) => [product.id, product]));

  for (const order of paidOrders) {
    for (const item of order.items) {
      const existing = byProduct.get(item.productId);
      if (existing) {
        existing.qty += item.quantity;
        existing.sales += item.lineTotal;
      } else {
        const product = productById.get(item.productId);
        byProduct.set(item.productId, {
          productId: item.productId,
          name: item.productName,
          imageUrl: product?.imageUrl,
          qty: item.quantity,
          sales: item.lineTotal,
        });
      }

      const category = productById.get(item.productId)?.categoryName ?? 'Others';
      byCategory.set(category, (byCategory.get(category) ?? 0) + item.lineTotal);

      const unitCost = productById.get(item.productId)?.cost ?? 0;
      profit += item.lineTotal - unitCost * item.quantity;
    }
  }

  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.qty - a.qty);
  const categorySales = Array.from(byCategory.entries())
    .map(([category, sales]) => ({ category, sales }))
    .sort((a, b) => b.sales - a.sales);

  const lowStockCount = products.reduce((count, item) => {
    const baseLow = item.stock <= item.minStock ? 1 : 0;
    return count + baseLow + countVariantLowStocks(item);
  }, 0);
  const pendingOrders = orders.filter((item) => item.status === 'pending').length;
  const outgoingOrders = orders.filter((item) => ['approved', 'confirmed', 'preparing', 'packed', 'shipped', 'out_for_delivery'].includes(item.status)).length;

  const metrics: SalesMetrics = {
    grossSales,
    profit,
    totalOrders,
    averageOrderValue,
    topSellingProduct: topProducts[0]?.name ?? 'No data',
    lowStockCount,
    pendingOrders,
    outgoingOrders,
  };

  return { metrics, topProducts, categorySales };
}

export async function fetchAdminCategories(): Promise<Category[]> {
  if (!supabase) {
    return [];
  }

  if (categoryIconColumnSupported !== false) {
    const { data, error } = await supabase.from('categories').select('id, name, icon').order('name', { ascending: true });
    if (!error) {
      categoryIconColumnSupported = true;
      return data ?? [];
    }

    if (!isMissingColumnError(error.message)) {
      throw new Error(error.message);
    }

    categoryIconColumnSupported = false;
  }

  const { data, error } = await supabase.from('categories').select('id, name').order('name', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchShippingMethodsAdmin(): Promise<ShippingMethod[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('shipping_methods')
    .select('id, name, description, base_fee, eta_min_days, eta_max_days, is_active')
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRowToShippingMethod);
}

export async function saveShippingMethod(input: {
  id?: string;
  name: string;
  description?: string;
  baseFee: number;
  etaMinDays?: number;
  etaMaxDays?: number;
  isActive?: boolean;
}) {
  if (!supabase) {
    throw new Error('Shipping methods require Supabase.');
  }

  const payload = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    base_fee: input.baseFee,
    eta_min_days: input.etaMinDays ?? null,
    eta_max_days: input.etaMaxDays ?? null,
    is_active: input.isActive ?? true,
  };

  if (input.id) {
    const { error } = await supabase.from('shipping_methods').update(payload).eq('id', input.id);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from('shipping_methods').insert(payload);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteShippingMethod(id: string) {
  if (!supabase) {
    throw new Error('Shipping methods require Supabase.');
  }

  const { error } = await supabase.from('shipping_methods').delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function saveCategory(input: { name: string; icon?: string }): Promise<string> {
  if (!supabase) {
    throw new Error('Categories require Supabase.');
  }

  const payload = { name: input.name.trim(), icon: input.icon?.trim() || null };

  if (categoryIconColumnSupported !== false) {
    const { data, error } = await supabase.from('categories').insert(payload).select('id').single();
    if (!error) {
      categoryIconColumnSupported = true;
      return data.id;
    }

    if (!isMissingColumnError(error.message)) {
      throw new Error(error.message);
    }

    categoryIconColumnSupported = false;
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: input.name.trim() })
    .select('id')
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data.id;
}

export async function updateCategory(input: { id: string; name: string; icon?: string }) {
  if (!supabase) {
    throw new Error('Categories require Supabase.');
  }

  const payload = { name: input.name.trim(), icon: input.icon?.trim() || null };

  if (categoryIconColumnSupported !== false) {
    const { error } = await supabase.from('categories').update(payload).eq('id', input.id);
    if (!error) {
      categoryIconColumnSupported = true;
      return;
    }

    if (!isMissingColumnError(error.message)) {
      throw new Error(error.message);
    }

    categoryIconColumnSupported = false;
  }

  const { error } = await supabase.from('categories').update({ name: input.name.trim() }).eq('id', input.id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteCategory(id: string) {
  if (!supabase) {
    throw new Error('Categories require Supabase.');
  }

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteProduct(id: string) {
  if (!supabase) {
    throw new Error('Products require Supabase.');
  }

  // Delete images first, then the product
  await supabase.from('product_images').delete().eq('product_id', id);
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchInventoryProducts(input?: { page?: number; pageSize?: number }): Promise<Product[]> {
  const page = Math.max(1, Number(input?.page ?? 1));
  const rawPageSize = Number(input?.pageSize ?? 0);
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.floor(rawPageSize) : 0;

  if (!supabase) {
    const sorted = [...localProducts].sort((a, b) => a.name.localeCompare(b.name));
    if (!pageSize) {
      return sorted;
    }

    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }

  let query = supabase.from('products').select(
      `
      id,
      name,
      description,
      sku,
      category_id,
      unit,
      cost,
      price,
      stock,
      min_stock,
      image_url,
      on_sale,
      sale_price,
      sort_priority,
      is_active,
      categories ( id, name ),
      product_images ( id, product_id, image_url, sort_order ),
      product_variants ( id, product_id, name, value, price_delta, stock_override, is_active )
    `,
    );

  if (pageSize > 0) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    query = query.range(start, end);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRowToProduct);
}

interface SaveProductVariantInput {
  id?: string;
  name: string;
  value: string;
  priceDelta?: number;
  stockOverride?: number;
  isActive?: boolean;
}

function normalizeVariantKey(name: string, value: string) {
  return `${name.trim().toLowerCase()}::${value.trim().toLowerCase()}`;
}

async function syncProductVariants(productId: string, variants: SaveProductVariantInput[]) {
  if (!supabase) {
    return;
  }

  const cleaned = variants
    .map((variant) => ({
      id: variant.id,
      name: variant.name.trim(),
      value: variant.value.trim(),
      priceDelta: Number(variant.priceDelta ?? 0),
      stockOverride:
        variant.stockOverride === undefined || variant.stockOverride === null || Number.isNaN(Number(variant.stockOverride))
          ? null
          : Math.max(0, Math.round(Number(variant.stockOverride))),
      isActive: variant.isActive ?? true,
    }))
    .filter((variant) => variant.name && variant.value);

  const deduped = new Map<string, (typeof cleaned)[number]>();
  for (const variant of cleaned) {
    deduped.set(normalizeVariantKey(variant.name, variant.value), variant);
  }

  const nextVariants = Array.from(deduped.values());

  const { data: existingRows, error: existingError } = await supabase
    .from('product_variants')
    .select('id, name, value')
    .eq('product_id', productId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingById = new Map((existingRows ?? []).map((row: any) => [String(row.id), row]));
  const keepIds = new Set<string>();

  for (const variant of nextVariants) {
    const payload = {
      product_id: productId,
      name: variant.name,
      value: variant.value,
      price_delta: variant.priceDelta,
      stock_override: variant.stockOverride,
      is_active: variant.isActive,
    };

    if (variant.id && existingById.has(variant.id)) {
      const { error } = await supabase
        .from('product_variants')
        .update(payload)
        .eq('id', variant.id)
        .eq('product_id', productId);
      if (error) {
        throw new Error(error.message);
      }
      keepIds.add(variant.id);
      continue;
    }

    const { data, error } = await supabase
      .from('product_variants')
      .insert(payload)
      .select('id')
      .single();
    if (error) {
      throw new Error(error.message);
    }

    keepIds.add(String(data.id));
  }

  const existingIds = (existingRows ?? []).map((row: any) => String(row.id));
  const archiveIds = existingIds.filter((id) => !keepIds.has(id));
  if (archiveIds.length) {
    const { error } = await supabase
      .from('product_variants')
      .update({ is_active: false })
      .in('id', archiveIds)
      .eq('product_id', productId);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function ensureCategoryId(categoryName: string): Promise<string> {
  if (!supabase) {
    return categoryName || 'cat-household';
  }

  const trimmed = categoryName.trim();
  if (!trimmed) {
    throw new Error('Category is required.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('categories')
    .select('id, name')
    .ilike('name', trimmed)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from('categories')
    .insert({
      name: trimmed,
    })
    .select('id')
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return created.id;
}

export async function saveProduct(input: {
  id?: string;
  name: string;
  description?: string;
  categoryName: string;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  sku?: string;
  imageUrls?: string[];
  isActive?: boolean;
  onSale?: boolean;
  salePrice?: number;
  sortPriority?: number;
  variants?: SaveProductVariantInput[];
}) {
  if (!supabase) {
    const existingIndex = localProducts.findIndex((item) => item.id === input.id);

    const productId = input.id ?? `mock-${Date.now()}`;
    const product: Product = {
      id: productId,
      name: input.name,
      description: input.description ?? '',
      sku: input.sku ?? `SKU-${Date.now().toString().slice(-6)}`,
      categoryId: input.categoryName.toLowerCase().replace(/\s+/g, '-'),
      categoryName: input.categoryName,
      unit: input.unit,
      cost: input.cost,
      price: input.price,
      stock: input.stock,
      minStock: input.minStock,
      imageUrl: input.imageUrls?.[0],
      images: (input.imageUrls ?? []).map((imageUrl, index) => ({
        id: `mock-image-${Date.now()}-${index}`,
        productId,
        imageUrl,
        sortOrder: index,
      })),
      variants:
        input.variants?.map((variant) => ({
          id: variant.id ?? `mock-var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          productId,
          name: variant.name,
          value: variant.value,
          priceDelta: Number(variant.priceDelta ?? 0),
          stockOverride: variant.stockOverride,
          isActive: variant.isActive ?? true,
        })) ?? [],
      onSale: Boolean(input.onSale ?? false),
      salePrice: input.salePrice,
      sortPriority: Number(input.sortPriority ?? 0),
      isActive: input.isActive ?? true,
    };

    if (existingIndex >= 0) {
      localProducts[existingIndex] = product;
    } else {
      localProducts.unshift(product);
    }

    return product;
  }

  const categoryId = await ensureCategoryId(input.categoryName);
  const payload = {
    name: input.name,
    description: input.description ?? '',
    category_id: categoryId,
    unit: input.unit,
    cost: input.cost,
    price: input.price,
    stock: input.stock,
    min_stock: input.minStock,
    sku: input.sku || `${input.categoryName.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`,
    image_url: input.imageUrls?.[0] ?? null,
    on_sale: input.onSale ?? false,
    sale_price: input.onSale ? input.salePrice ?? null : null,
    sort_priority: input.sortPriority ?? 0,
    is_active: input.isActive ?? true,
  };

  const query = input.id ? supabase.from('products').update(payload).eq('id', input.id) : supabase.from('products').insert(payload);
  const { data, error } = await query.select(
    `
      id,
      name,
      description,
      sku,
      category_id,
      unit,
      cost,
      price,
      stock,
      min_stock,
      image_url,
      on_sale,
      sale_price,
      sort_priority,
      is_active,
      categories ( id, name ),
      product_images ( id, product_id, image_url, sort_order ),
      product_variants ( id, product_id, name, value, price_delta, stock_override, is_active )
    `,
  ).single();

  if (error) {
    throw new Error(error.message);
  }

  if (input.imageUrls) {
    const productId = data.id as string;
    const { error: clearError } = await supabase.from('product_images').delete().eq('product_id', productId);
    if (clearError) {
      throw new Error(clearError.message);
    }

    if (input.imageUrls.length) {
      const { error: imageError } = await supabase.from('product_images').insert(
        input.imageUrls.slice(0, 20).map((imageUrl, index) => ({
          product_id: productId,
          image_url: imageUrl,
          sort_order: index,
        })),
      );
      if (imageError) {
        throw new Error(imageError.message);
      }
    }
  }

  if (input.variants) {
    await syncProductVariants(String(data.id), input.variants);
  }

  const { data: nextRow, error: nextError } = await supabase
    .from('products')
    .select(
      `
      id,
      name,
      description,
      sku,
      category_id,
      unit,
      cost,
      price,
      stock,
      min_stock,
      image_url,
      on_sale,
      sale_price,
      sort_priority,
      is_active,
      categories ( id, name ),
      product_images ( id, product_id, image_url, sort_order ),
      product_variants ( id, product_id, name, value, price_delta, stock_override, is_active )
    `,
    )
    .eq('id', String(data.id))
    .single();

  if (nextError) {
    throw new Error(nextError.message);
  }

  return mapRowToProduct(nextRow);
}

export async function fetchRecentTransactions(
  limit = 20,
  rangePreset: SalesRangePreset = 'month',
  customRange?: DateRange,
): Promise<Order[]> {
  const range = buildDateRange(rangePreset, customRange);

  if (!supabase) {
    return localOrders.filter((order) => isInsideRange(order.createdAt, range)).slice(0, limit);
  }

  const { data: ordersData, error: ordersError } = await supabase
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
      created_at
    `,
    )
    .gte('created_at', range.start)
    .lte('created_at', range.end)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  const orderIds = (ordersData ?? []).map((row) => row.id);
  if (!orderIds.length) {
    return [];
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from('order_items')
    .select('id, order_id, product_id, variant_id, variant_name, variant_value, product_name, sku, unit_price, quantity, line_total')
    .in('order_id', orderIds);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const itemMap = new Map<string, any[]>();
  for (const row of itemsData ?? []) {
    const list = itemMap.get(row.order_id) ?? [];
    list.push(row);
    itemMap.set(row.order_id, list);
  }

  return (ordersData ?? []).map((orderRow) => mapRowToOrder({ ...orderRow, order_items: itemMap.get(orderRow.id) ?? [] }));
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, note?: string, lat?: number, lng?: number) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.rpc('admin_update_order_status', {
    p_order_id: orderId,
    p_next_status: status,
    p_note: note ?? null,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
  });
  if (error) {
    const details = [error.message, error.details, error.hint].filter(Boolean).join(' ');
    throw new Error(details || 'Failed to update order status.');
  }
}

export async function fetchOpenRefundRequests() {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('refund_requests')
    .select('id, order_id, customer_id, status, reason, note, evidence_urls, requested_at, resolved_at, admin_note')
    .order('requested_at', { ascending: false });
  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function resolveRefund(refundRequestId: string, approve: boolean, adminNote?: string) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.rpc('admin_resolve_refund', {
    p_refund_request_id: refundRequestId,
    p_approve: approve,
    p_admin_note: adminNote ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchAdminOrderAlertCount(sinceIso?: string): Promise<number> {
  if (!supabase) {
    return 0;
  }

  let query = supabase
    .from('orders')
    .select('id', { head: true, count: 'exact' })
    .in('status', ['pending', 'approved', 'refund_requested']);

  if (sinceIso) {
    query = query.gt('updated_at', sinceIso);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return Number(count ?? 0);
}

export async function fetchDashboardSnapshot(
  rangePreset: SalesRangePreset = 'month',
  customRange?: DateRange,
): Promise<DashboardSnapshot> {
  const [products, recentTransactions] = await Promise.all([
    fetchInventoryProducts(),
    fetchRecentTransactions(50, rangePreset, customRange),
  ]);

  const range = buildDateRange(rangePreset, customRange);
  const transactionsInRange = recentTransactions.filter((order) => isInsideRange(order.createdAt, range));

  const { metrics, topProducts, categorySales } = buildMetrics(products, transactionsInRange);
  const baseLowStockItems = products.filter((product) => product.stock <= product.minStock);
  const variantLowStockItems = buildVariantLowStockItems(products);
  const lowStockItems = [...baseLowStockItems, ...variantLowStockItems]
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8);

  return {
    metrics,
    topProducts: topProducts.slice(0, 5),
    categorySales: categorySales.slice(0, 6),
    lowStockItems,
    recentTransactions,
  };
}
