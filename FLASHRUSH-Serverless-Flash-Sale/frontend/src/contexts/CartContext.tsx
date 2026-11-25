import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CartItem } from '../types/cart';
import type { Product } from '../types/product';
import { CART_CHANGED, CART_KEY, readCart, withCartItem, withCartQuantity, writeCart } from '../services/cartStorage';

interface Cart {
  items: CartItem[];
  storageError: string;
  addItem(product: Product, quantity: number, limit: number, selectedColor?: string): void;
  updateQuantity(productId: string, quantity: number, limit: number): void;
  removeItem(productId: string): void;
  clearCart(): void;
}

const CartContext = createContext<Cart | null>(null);
const unavailable = 'Không thể truy cập giỏ hàng đã lưu trên trình duyệt.';

function restore() {
  try { return { items: readCart(), storageError: '' }; }
  catch { return { items: [], storageError: unavailable }; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState(restore);
  useEffect(() => {
    const sync = () => setCart(restore());
    const onStorage = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) sync(); };
    window.addEventListener(CART_CHANGED, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CART_CHANGED, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function change(update: (items: CartItem[]) => CartItem[]) {
    const latest = restore();
    if (latest.storageError) throw new Error(latest.storageError);
    const items = update(latest.items);
    try { writeCart(items); }
    catch { throw new Error('Không thể lưu giỏ hàng trên trình duyệt.'); }
  }
  return <CartContext.Provider value={{
    ...cart,
    addItem: (product, quantity, limit, color) => change(items => withCartItem(items, product, quantity, limit, color)),
    updateQuantity: (id, quantity, limit) => change(items => withCartQuantity(items, id, quantity, limit)),
    removeItem: id => change(items => items.filter(item => item.productId !== id)),
    clearCart: () => change(() => []),
  }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('CartProvider is required');
  return cart;
}
