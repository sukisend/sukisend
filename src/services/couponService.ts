import { supabase } from '../lib/supabase';
import { CouponValidation } from '../types/models';

/**
 * Validate a coupon code for a given customer and subtotal.
 * Returns validation result with discount info if valid.
 */
export async function validateCoupon(
  code: string,
  customerId: string,
  subtotal: number,
): Promise<CouponValidation> {
  if (!supabase) {
    return { valid: false, error: 'Service unavailable.' };
  }

  const { data, error } = await supabase.rpc('validate_coupon', {
    p_code: code.trim(),
    p_customer_id: customerId,
    p_subtotal: subtotal,
  });

  if (error) {
    return { valid: false, error: 'Failed to validate coupon. Please try again.' };
  }

  // RPC returns snake_case keys via jsonb_build_object(); map to camelCase
  const row = data as any;
  if (!row || !row.valid) {
    return { valid: false, error: row?.error ?? 'Invalid coupon.' };
  }

  return {
    valid: true,
    couponId: row.coupon_id ?? undefined,
    code: row.code ?? undefined,
    description: row.description ?? undefined,
    discountType: row.discount_type ?? undefined,
    discountValue: row.discount_value != null ? Number(row.discount_value) : undefined,
    discountAmount: row.discount_amount != null ? Number(row.discount_amount) : undefined,
    maxDiscount: row.max_discount != null ? Number(row.max_discount) : undefined,
  } as CouponValidation;
}

/**
 * Record coupon usage after order is placed.
 */
export async function applyCoupon(
  couponId: string,
  customerId: string,
  orderId: string,
): Promise<void> {
  if (!supabase) return;

  await supabase.rpc('apply_coupon', {
    p_coupon_id: couponId,
    p_customer_id: customerId,
    p_order_id: orderId,
  });
}

/**
 * Calculate discount amount from validation result.
 */
export function calculateDiscount(
  subtotal: number,
  discountType: 'percent' | 'fixed',
  discountValue: number,
  maxDiscount?: number,
): number {
  let discount = discountType === 'percent'
    ? (subtotal * discountValue) / 100
    : discountValue;

  if (maxDiscount) {
    discount = Math.min(discount, maxDiscount);
  }

  return Math.min(discount, subtotal);
}
