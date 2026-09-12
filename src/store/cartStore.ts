import AsyncStorage from '@react-native-async-storage/async-storage';
const { create } = require('zustand') as typeof import('zustand');
const { createJSONStorage, persist } = require('zustand/middleware') as typeof import('zustand/middleware');

import { CartItem, CouponValidation, Product } from '../types/models';
import { getProductBasePrice } from '../utils/pricing';

function getEffectiveStock(product: Product, variantId?: string): number {
  if (variantId) {
    const variant = (product.variants ?? []).find((v) => v.id === variantId);
    if (variant && Number.isFinite(variant.stockOverride)) {
      return Number(variant.stockOverride);
    }
  }
  const activeVariants = (product.variants ?? []).filter(
    (v) => v.isActive && Number.isFinite(v.stockOverride),
  );
  if (activeVariants.length > 0) {
    return activeVariants.reduce((sum, v) => sum + Number(v.stockOverride), 0);
  }
  return product.stock;
}

interface AppliedCoupon {
  couponId: string;
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  discountAmount: number;
}

interface CartState {
  items: CartItem[];
  appliedCoupon: AppliedCoupon | null;
  addItem: (
    product: Product,
    quantity?: number,
    options?: {
      variantId?: string;
      variantLabel?: string;
      unitPrice?: number;
    },
  ) => void;
  setQuantity: (productId: string, quantity: number, variantId?: string) => void;
  removeItem: (productId: string, variantId?: string) => void;
  clearCart: () => void;
  itemCount: () => number;
  subtotal: () => number;
  applyCoupon: (validation: CouponValidation) => void;
  removeCoupon: () => void;
  getDiscount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      appliedCoupon: null,
      addItem: (product, quantity = 1, options) => {
        set((state) => {
          const existing = state.items.find(
            (item) => item.product.id === product.id && (item.variantId ?? '') === (options?.variantId ?? ''),
          );
          if (existing) {
            const effectiveStock = getEffectiveStock(product, options?.variantId);
            return {
              appliedCoupon: null,
              items: state.items.map((item) =>
                item.product.id === product.id && (item.variantId ?? '') === (options?.variantId ?? '')
                  ? {
                      ...item,
                      quantity: Math.min(item.quantity + quantity, effectiveStock),
                    }
                  : item,
              ),
            };
          }

          const effectiveStock = getEffectiveStock(product, options?.variantId);
          return {
            appliedCoupon: null,
            items: [
              ...state.items,
              {
                product,
                quantity: Math.min(quantity, Math.max(1, effectiveStock)),
                variantId: options?.variantId,
                variantLabel: options?.variantLabel,
                unitPrice: options?.unitPrice,
              },
            ],
          };
        });
      },
      setQuantity: (productId, quantity, variantId) => {
        set((state) => ({
          appliedCoupon: null,
          items: state.items
            .map((item) =>
              item.product.id === productId && (variantId ? item.variantId === variantId : true)
                ? { ...item, quantity: Math.max(1, Math.min(quantity, Math.max(1, getEffectiveStock(item.product, item.variantId)))) }
                : item,
            )
            .filter((item) => item.quantity > 0),
        }));
      },
      removeItem: (productId, variantId) => {
        set((state) => ({
          appliedCoupon: null,
          items: state.items.filter((item) =>
            variantId ? !(item.product.id === productId && item.variantId === variantId) : item.product.id !== productId,
          ),
        }));
      },
      clearCart: () => set({ items: [], appliedCoupon: null }),
      itemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: () =>
        get().items.reduce((sum, item) => sum + (item.unitPrice ?? getProductBasePrice(item.product)) * item.quantity, 0),
      applyCoupon: (validation) => {
        if (!validation.valid || !validation.couponId) return;
        const discountAmount = validation.discountAmount ?? (
          validation.discountType === 'percent'
            ? 0
            : validation.discountValue ?? 0
        );
        set({
          appliedCoupon: {
            couponId: validation.couponId,
            code: validation.code!,
            description: validation.description || '',
            discountType: validation.discountType!,
            discountValue: validation.discountValue!,
            discountAmount,
          },
        });
      },
      removeCoupon: () => set({ appliedCoupon: null }),
      getDiscount: () => get().appliedCoupon?.discountAmount ?? 0,
    }),
    {
      name: 'suki-send-cart',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }),
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version === 1) {
          return { ...persistedState, appliedCoupon: null };
        }
        return persistedState;
      },
    },
  ),
);
