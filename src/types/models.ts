export type UserRole = 'guest' | 'customer' | 'admin';

export type SalesRangePreset =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | '3months'
  | '6months'
  | 'year'
  | 'custom';

export type OrderStatus =
  | 'pending'
  | 'approved'
  | 'confirmed'
  | 'preparing'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'refund_requested'
  | 'refunded'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export type ProductSortOption =
  | 'best_selling'
  | 'name_asc'
  | 'on_sale'
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc';

export interface ProductImage {
  id: string;
  productId: string;
  imageUrl: string;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  value: string;
  priceDelta: number;
  stockOverride?: number;
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  imageUrl?: string;
  images?: ProductImage[];
  variants?: ProductVariant[];
  onSale?: boolean;
  salePrice?: number;
  sortPriority?: number;
  isActive: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  variantId?: string;
  variantLabel?: string;
  unitPrice?: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string;
  variantName?: string;
  variantValue?: string;
  productName: string;
  sku?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNo: string;
  customerId: string;
  status: OrderStatus;
  paymentMethod: 'COD';
  paymentStatus?: PaymentStatus;
  shippingMethodId?: string;
  shippingMethodName?: string;
  trackingNumber?: string;
  deliveryArea: string;
  deliveryAddress: string;
  customerNote?: string;
  expectedDeliveryStart?: string;
  expectedDeliveryEnd?: string;
  latestLat?: number;
  latestLng?: number;
  approvedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  refundedAt?: string;
  refundDeadlineAt?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: string;
  items: OrderItem[];
}

export interface AppProfile {
  id: string;
  email: string;
  fullName: string;
  role: Exclude<UserRole, 'guest'>;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  countryRegion: string;
  firstName: string;
  lastName: string;
  phone: string;
  province: string;
  city: string;
  barangay: string;
  postalCode: string;
  line1: string;
  line2?: string;
  isDefault: boolean;
}

export interface ShippingMethod {
  id: string;
  name: string;
  description?: string;
  baseFee: number;
  etaMinDays?: number;
  etaMaxDays?: number;
  isActive: boolean;
}

export interface OrderTrackingEvent {
  id: string;
  orderId: string;
  status: OrderStatus;
  title: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  eventAt: string;
}

export interface WishlistItem {
  id: string;
  customerId: string;
  productId: string;
  product?: Product;
}

export interface ProductReview {
  id: string;
  orderId: string;
  orderItemId: string;
  productId: string;
  customerId: string;
  authorName?: string;
  rating: number;
  comment?: string;
  images: string[];
  createdAt: string;
}

export interface RiderReview {
  id: string;
  orderId: string;
  customerId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface RefundRequest {
  id: string;
  orderId: string;
  customerId: string;
  status: 'open' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  note?: string;
  evidenceUrls: string[];
  requestedAt: string;
  resolvedAt?: string;
  adminNote?: string;
}

export interface SalesMetrics {
  grossSales: number;
  totalOrders: number;
  averageOrderValue: number;
  topSellingProduct: string;
  lowStockCount: number;
  pendingOrders?: number;
  outgoingOrders?: number;
}

export interface ProductSalesRank {
  productId: string;
  name: string;
  qty: number;
  sales: number;
}

export interface CategorySales {
  category: string;
  sales: number;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface DashboardSnapshot {
  metrics: SalesMetrics;
  topProducts: ProductSalesRank[];
  categorySales: CategorySales[];
  lowStockItems: Product[];
  recentTransactions: Order[];
}
