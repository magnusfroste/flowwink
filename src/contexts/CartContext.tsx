import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface CartItem {
  productId: string;
  productName: string;
  priceCents: number;
  currency: string;
  quantity: number;
  imageUrl?: string | null;
  /** Selected product variant (size/color combination). Absent for simple
   *  products and for carts persisted before variants shipped. */
  variantId?: string | null;
  /** Human-readable variant label, e.g. "Red / M". */
  variantLabel?: string | null;
}

/** Two cart lines are the same when both product AND variant match. */
function sameLine(item: CartItem, productId: string, variantId?: string | null) {
  return item.productId === productId && (item.variantId ?? null) === (variantId ?? null);
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (productId: string, variantId?: string | null) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string | null) => void;
  clearCart: () => void;
  totalItems: number;
  totalPriceCents: number;
  currency: string;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'flowwink_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isOpen, setIsOpen] = useState(false);

  // Persist cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage errors
    }
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>, quantity = 1) => {
    setItems(current => {
      const existing = current.find(i => sameLine(i, item.productId, item.variantId));
      if (existing) {
        return current.map(i =>
          sameLine(i, item.productId, item.variantId)
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...current, { ...item, quantity }];
    });
    // Auto-open cart when adding items
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((productId: string, variantId?: string | null) => {
    setItems(current => current.filter(i => !sameLine(i, productId, variantId)));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number, variantId?: string | null) => {
    if (quantity <= 0) {
      removeItem(productId, variantId);
      return;
    }
    setItems(current =>
      current.map(i =>
        sameLine(i, productId, variantId) ? { ...i, quantity } : i
      )
    );
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen(prev => !prev), []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPriceCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const currency = items[0]?.currency || 'USD';

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPriceCents,
        currency,
        isOpen,
        openCart,
        closeCart,
        toggleCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
