import { create } from 'zustand';

import { CartItem, Product } from '../types/models';
import { getProductBasePrice } from '../utils/pricing';

interface CartState {
  items: CartItem[];
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
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (product, quantity = 1, options) => {
    set((state) => {
      const existing = state.items.find(
        (item) => item.product.id === product.id && (item.variantId ?? '') === (options?.variantId ?? ''),
      );
      if (existing) {
        return {
          items: state.items.map((item) =>
            item.product.id === product.id && (item.variantId ?? '') === (options?.variantId ?? '')
              ? {
                  ...item,
                  quantity: Math.min(item.quantity + quantity, product.stock),
                }
              : item,
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            product,
            quantity: Math.min(quantity, Math.max(1, product.stock)),
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
      items: state.items
        .map((item) =>
          item.product.id === productId && (variantId ? item.variantId === variantId : true)
            ? { ...item, quantity: Math.max(1, Math.min(quantity, Math.max(1, item.product.stock))) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    }));
  },
  removeItem: (productId, variantId) => {
    set((state) => ({
      items: state.items.filter((item) =>
        variantId ? !(item.product.id === productId && item.variantId === variantId) : item.product.id !== productId,
      ),
    }));
  },
  clearCart: () => set({ items: [] }),
  itemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
  subtotal: () => get().items.reduce((sum, item) => sum + (item.unitPrice ?? getProductBasePrice(item.product)) * item.quantity, 0),
}));
