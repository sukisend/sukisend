import dayjs from 'dayjs';

import { mockCategories, mockProducts, mockTransactions } from '../data/mockData';
import { supabase } from '../lib/supabase';
import {
  CartItem,
  Category,
  CustomerAddress,
  Order,
  OrderTrackingEvent,
  Product,
  ProductReview,
  ProductSortOption,
  RiderReview,
  ShippingMethod,
  WishlistItem,
} from '../types/models';
import { getProductBasePrice } from '../utils/pricing';

interface ProductQuery {
  search?: string;
  categoryId?: string;
  sort?: ProductSortOption;
  page?: number;
  pageSize?: number;
}

let categoryIconColumnSupported: boolean | null = null;
let addressCoordinatesSupported: boolean | null = null;
const ADDRESS_SELECT_COLUMNS =
  'id, customer_id, country_region, first_name, last_name, phone, province, city, barangay, postal_code, line1, line2, latitude, longitude, is_default';
const ADDRESS_SELECT_COLUMNS_LEGACY =
  'id, customer_id, country_region, first_name, last_name, phone, province, city, barangay, postal_code, line1, line2, is_default';

function isMissingCategoryIconColumn(message?: string) {
  return (message ?? '').toLowerCase().includes('column') && (message ?? '').toLowerCase().includes('icon');
}

function isMissingAddressCoordinateColumn(message?: string) {
  const text = (message ?? '').toLowerCase();
  return text.includes('column') && (text.includes('latitude') || text.includes('longitude'));
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
  const items = (row.order_items ?? []).map((item: any) => {
    const itemProduct = Array.isArray(item.products) ? item.products[0] : item.products;
    const itemImages = Array.isArray(itemProduct?.product_images) ? itemProduct.product_images : [];
    const fallbackImage = itemImages
      .map((image: any) => image?.image_url)
      .find((url: unknown) => typeof url === 'string' && url.trim().length > 0);

    return {
      id: item.id,
      productId: item.product_id,
      variantId: item.variant_id ?? undefined,
      variantName: item.variant_name ?? undefined,
      variantValue: item.variant_value ?? undefined,
      productName: item.product_name,
      productImageUrl:
        (typeof item.product_image_url === 'string' && item.product_image_url) ||
        (typeof itemProduct?.image_url === 'string' ? itemProduct.image_url : undefined) ||
        (typeof fallbackImage === 'string' ? fallbackImage : undefined),
      sku: item.sku ?? '',
      unitPrice: Number(item.unit_price ?? 0),
      quantity: Number(item.quantity ?? 0),
      lineTotal: Number(item.line_total ?? 0),
    };
  });

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
    items,
  };
}

function mapRowToAddress(row: any): CustomerAddress {
  return {
    id: row.id,
    customerId: row.customer_id,
    countryRegion: row.country_region,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    province: row.province,
    city: row.city,
    barangay: row.barangay,
    postalCode: row.postal_code,
    line1: row.line1,
    line2: row.line2 ?? undefined,
    latitude: row.latitude === null ? undefined : Number(row.latitude),
    longitude: row.longitude === null ? undefined : Number(row.longitude),
    isDefault: Boolean(row.is_default),
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

function applySort(products: Product[], sort: ProductSortOption = 'best_selling') {
  const copy = [...products];

  switch (sort) {
    case 'all':
      return copy;
    case 'name_asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'on_sale':
      return copy.sort((a, b) => {
        const aOnSale = Number(Boolean(a.onSale));
        const bOnSale = Number(Boolean(b.onSale));
        if (aOnSale !== bOnSale) {
          return bOnSale - aOnSale;
        }
        return getProductBasePrice(a) - getProductBasePrice(b);
      });
    case 'newest':
      return copy;
    case 'oldest':
      return copy.reverse();
    case 'price_asc':
      return copy.sort((a, b) => getProductBasePrice(a) - getProductBasePrice(b));
    case 'price_desc':
      return copy.sort((a, b) => getProductBasePrice(b) - getProductBasePrice(a));
    case 'best_selling':
    default:
      return copy.sort((a, b) => (b.sortPriority ?? 0) - (a.sortPriority ?? 0));
  }
}

function applyDbSort<T>(query: T, sort: ProductSortOption | undefined) {
  const target = query as any;
  switch (sort) {
    case 'all':
      return target.order('created_at', { ascending: false });
    case 'name_asc':
      return target.order('name', { ascending: true });
    case 'on_sale':
      return target.order('on_sale', { ascending: false }).order('sort_priority', { ascending: false }).order('created_at', { ascending: false });
    case 'newest':
      return target.order('created_at', { ascending: false });
    case 'oldest':
      return target.order('created_at', { ascending: true });
    case 'price_asc':
      return target.order('price', { ascending: true });
    case 'price_desc':
      return target.order('price', { ascending: false });
    case 'best_selling':
    default:
      return target.order('sort_priority', { ascending: false }).order('created_at', { ascending: false });
  }
}

export async function fetchPublicCategories(): Promise<Category[]> {
  if (!supabase) {
    return mockCategories;
  }

  if (categoryIconColumnSupported !== false) {
    const { data, error } = await supabase.from('categories').select('id, name, icon').order('name', { ascending: true });
    if (!error) {
      categoryIconColumnSupported = true;
      return [{ id: 'all', name: 'All' }, ...(data ?? [])];
    }

    if (!isMissingCategoryIconColumn(error.message)) {
      throw new Error(error.message);
    }

    categoryIconColumnSupported = false;
  }

  const { data, error } = await supabase.from('categories').select('id, name').order('name', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return [{ id: 'all', name: 'All' }, ...(data ?? [])];
}

export async function fetchPublicProducts(query?: ProductQuery): Promise<Product[]> {
  const page = Math.max(1, Number(query?.page ?? 1));
  const rawPageSize = Number(query?.pageSize ?? 0);
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.floor(rawPageSize) : 0;

  if (!supabase) {
    const filtered = mockProducts.filter((product) => {
      const bySearch = query?.search
        ? product.name.toLowerCase().includes(query.search.toLowerCase()) ||
          (product.description ?? '').toLowerCase().includes(query.search.toLowerCase())
        : true;
      const byCategory = query?.categoryId && query.categoryId !== 'all' ? product.categoryId === query.categoryId : true;
      return bySearch && byCategory && product.isActive;
    });

    const sorted = applySort(filtered, query?.sort);
    if (!pageSize) {
      return sorted;
    }

    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }

  let dbQuery = supabase
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
    .eq('is_active', true);

  if (query?.categoryId && query.categoryId !== 'all') {
    dbQuery = dbQuery.eq('category_id', query.categoryId);
  }

  if (query?.search) {
    dbQuery = dbQuery.or(`name.ilike.%${query.search}%,description.ilike.%${query.search}%`);
  }

  dbQuery = applyDbSort(dbQuery, query?.sort);

  if (pageSize > 0) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    dbQuery = dbQuery.range(start, end);
  }

  const { data, error } = await dbQuery;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRowToProduct);
}

export async function fetchProductById(productId: string): Promise<Product | null> {
  if (!supabase) {
    return mockProducts.find((item) => item.id === productId) ?? null;
  }

  const { data, error } = await supabase
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
    .eq('id', productId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToProduct(data);
}

export async function fetchShippingMethods(): Promise<ShippingMethod[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('shipping_methods')
    .select('id, name, description, base_fee, eta_min_days, eta_max_days, is_active')
    .eq('is_active', true)
    .order('base_fee', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapRowToShippingMethod);
}

export async function fetchCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
  if (!supabase) {
    return [];
  }

  if (addressCoordinatesSupported !== false) {
    const { data, error } = await supabase
      .from('customer_addresses')
      .select(ADDRESS_SELECT_COLUMNS)
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (!error) {
      addressCoordinatesSupported = true;
      return (data ?? []).map(mapRowToAddress);
    }

    if (!isMissingAddressCoordinateColumn(error.message)) {
      throw new Error(error.message);
    }

    addressCoordinatesSupported = false;
  }

  const { data, error } = await supabase
    .from('customer_addresses')
    .select(ADDRESS_SELECT_COLUMNS_LEGACY)
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map(mapRowToAddress);
}

export async function saveCustomerAddress(input: Omit<CustomerAddress, 'id'> & { id?: string }): Promise<CustomerAddress> {
  if (!supabase) {
    throw new Error('Address management requires Supabase.');
  }

  const payload = {
    customer_id: input.customerId,
    country_region: input.countryRegion,
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    province: input.province,
    city: input.city,
    barangay: input.barangay,
    postal_code: input.postalCode,
    line1: input.line1,
    line2: input.line2 ?? null,
    latitude: Number.isFinite(input.latitude) ? Number(input.latitude) : null,
    longitude: Number.isFinite(input.longitude) ? Number(input.longitude) : null,
    is_default: input.isDefault,
  };

  if (input.id) {
    if (addressCoordinatesSupported !== false) {
      const { data, error } = await supabase
        .from('customer_addresses')
        .update(payload)
        .eq('id', input.id)
        .select(ADDRESS_SELECT_COLUMNS)
        .single();

      if (!error) {
        addressCoordinatesSupported = true;
        return mapRowToAddress(data);
      }

      if (!isMissingAddressCoordinateColumn(error.message)) {
        throw new Error(error.message);
      }

      addressCoordinatesSupported = false;
    }

    const legacyPayload = {
      customer_id: input.customerId,
      country_region: input.countryRegion,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone,
      province: input.province,
      city: input.city,
      barangay: input.barangay,
      postal_code: input.postalCode,
      line1: input.line1,
      line2: input.line2 ?? null,
      is_default: input.isDefault,
    };

    const { data, error } = await supabase
      .from('customer_addresses')
      .update(legacyPayload)
      .eq('id', input.id)
      .select(ADDRESS_SELECT_COLUMNS_LEGACY)
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return mapRowToAddress(data);
  }

  if (addressCoordinatesSupported !== false) {
    const { data, error } = await supabase
      .from('customer_addresses')
      .insert(payload)
      .select(ADDRESS_SELECT_COLUMNS)
      .single();
    if (!error) {
      addressCoordinatesSupported = true;
      return mapRowToAddress(data);
    }

    if (!isMissingAddressCoordinateColumn(error.message)) {
      throw new Error(error.message);
    }

    addressCoordinatesSupported = false;
  }

  const legacyPayload = {
    customer_id: input.customerId,
    country_region: input.countryRegion,
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    province: input.province,
    city: input.city,
    barangay: input.barangay,
    postal_code: input.postalCode,
    line1: input.line1,
    line2: input.line2 ?? null,
    is_default: input.isDefault,
  };

  const { data, error } = await supabase
    .from('customer_addresses')
    .insert(legacyPayload)
    .select(ADDRESS_SELECT_COLUMNS_LEGACY)
    .single();
  if (error) {
    throw new Error(error.message);
  }

  return mapRowToAddress(data);
}

export async function deleteCustomerAddress(addressId: string) {
  if (!supabase) {
    throw new Error('Address management requires Supabase.');
  }

  const { error } = await supabase.from('customer_addresses').delete().eq('id', addressId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function setDefaultAddress(addressId: string, customerId: string) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from('customer_addresses')
    .update({ is_default: true })
    .eq('id', addressId)
    .eq('customer_id', customerId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function createCodOrder(input: {
  customerId: string;
  addressId: string;
  shippingMethodId: string;
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

  return (data ?? []).map(mapRowToOrder);
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

export async function fetchWishlist(customerId: string): Promise<WishlistItem[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('wishlist_items')
    .select(
      `
      id,
      customer_id,
      product_id,
      products (
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
      )
    `,
    )
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((item: any) => {
    const product = Array.isArray(item.products) ? item.products[0] : item.products;
    return {
      id: item.id,
      customerId,
      productId: item.product_id,
      product: product ? mapRowToProduct(product) : undefined,
    };
  });
}

export async function toggleWishlist(customerId: string, productId: string): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  const { data: existing, error: checkError } = await supabase
    .from('wishlist_items')
    .select('id')
    .eq('customer_id', customerId)
    .eq('product_id', productId)
    .maybeSingle();
  if (checkError) {
    throw new Error(checkError.message);
  }

  if (existing?.id) {
    const { error } = await supabase.from('wishlist_items').delete().eq('id', existing.id);
    if (error) {
      throw new Error(error.message);
    }
    return false;
  }

  const { error } = await supabase.from('wishlist_items').insert({
    customer_id: customerId,
    product_id: productId,
  });
  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function fetchProductReviews(productId: string): Promise<ProductReview[]> {
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('product_reviews')
    .select(
      `
      id,
      order_id,
      order_item_id,
      product_id,
      customer_id,
      rating,
      comment,
      created_at,
      profiles ( full_name ),
      review_images ( image_url )
    `,
    )
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    productId: row.product_id,
    customerId: row.customer_id,
    authorName: (Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name) ?? 'Customer',
    rating: Number(row.rating ?? 0),
    comment: row.comment ?? undefined,
    images: (row.review_images ?? []).map((image: any) => image.image_url),
    createdAt: row.created_at,
  }));
}

export async function submitProductReview(input: {
  orderId: string;
  orderItemId: string;
  productId: string;
  customerId: string;
  rating: number;
  comment?: string;
  imageUrls?: string[];
}) {
  if (!supabase) {
    throw new Error('Reviews require Supabase.');
  }

  if ((input.imageUrls?.length ?? 0) > 5) {
    throw new Error('Maximum of 5 review photos is allowed.');
  }

  const { data, error } = await supabase
    .from('product_reviews')
    .insert({
      order_id: input.orderId,
      order_item_id: input.orderItemId,
      product_id: input.productId,
      customer_id: input.customerId,
      rating: input.rating,
      comment: input.comment ?? null,
    })
    .select('id')
    .single();
  if (error) {
    throw new Error(error.message);
  }

  if (input.imageUrls?.length) {
    const { error: imagesError } = await supabase.from('review_images').insert(
      input.imageUrls.map((imageUrl, index) => ({
        review_id: data.id,
        image_url: imageUrl,
        sort_order: index,
      })),
    );
    if (imagesError) {
      throw new Error(imagesError.message);
    }
  }

  return data.id;
}

export async function submitRiderReview(input: { orderId: string; customerId: string; rating: number; comment?: string }) {
  if (!supabase) {
    throw new Error('Reviews require Supabase.');
  }

  const { error } = await supabase.from('rider_reviews').upsert(
    {
      order_id: input.orderId,
      customer_id: input.customerId,
      rating: input.rating,
      comment: input.comment ?? null,
    },
    { onConflict: 'order_id,customer_id' },
  );
  if (error) {
    throw new Error(error.message);
  }
}
