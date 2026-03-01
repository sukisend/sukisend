import { Product, ProductVariant } from '../types/models';

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

export function getProductBasePrice(product: Product): number {
  const salePrice = toFiniteNumber(product.salePrice);
  if (
    product.onSale &&
    salePrice !== null &&
    salePrice >= 0 &&
    salePrice < Number(product.price)
  ) {
    return salePrice;
  }
  return Number(product.price);
}

export function getVariantUnitPrice(product: Product, variant?: ProductVariant): number {
  const basePrice = Number(product.price);
  const delta = Number(variant?.priceDelta ?? 0);
  const regularVariantPrice = Number.isFinite(basePrice + delta) ? basePrice + delta : basePrice;

  const salePrice = toFiniteNumber(product.salePrice);
  const hasDiscount =
    Boolean(product.onSale) &&
    salePrice !== null &&
    Number.isFinite(basePrice) &&
    basePrice > 0 &&
    salePrice >= 0 &&
    salePrice < basePrice;

  if (!hasDiscount || salePrice === null) {
    return Number(Math.max(0, regularVariantPrice).toFixed(2));
  }

  const discountFactor = salePrice / basePrice;
  return Number(Math.max(0, regularVariantPrice * discountFactor).toFixed(2));
}

export function getDiscountPercentFromPrice(price: number, salePrice?: number, onSale?: boolean): number {
  if (!onSale) {
    return 0;
  }

  const base = Number(price);
  const sale = Number(salePrice);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(sale) || sale < 0 || sale >= base) {
    return 0;
  }

  return Number((((1 - sale / base) * 100)).toFixed(2));
}

export function computeSalePrice(price: number, discountPercent: number): number | undefined {
  const base = Number(price);
  if (!Number.isFinite(base) || base < 0) {
    return undefined;
  }

  const percent = clampPercent(Number(discountPercent));
  if (percent <= 0) {
    return undefined;
  }

  return Number((base * (1 - percent / 100)).toFixed(2));
}
