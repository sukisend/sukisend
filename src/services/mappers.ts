import { CustomerAddress, Order, Product, ShippingMethod } from '../types/models';

export function mapRowToProduct(row: any): Product {
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
    imageUrl: variant.image_url ?? undefined,
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

export function mapRowToOrder(row: any): Order {
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

export function mapRowToShippingMethod(row: any): ShippingMethod {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    baseFee: Number(row.base_fee ?? 0),
    ratePerKm: Number(row.rate_per_km ?? 15),
    etaMinDays: row.eta_min_days ?? undefined,
    etaMaxDays: row.eta_max_days ?? undefined,
    isActive: Boolean(row.is_active ?? true),
  };
}

export function mapRowToAddress(row: any): CustomerAddress {
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
