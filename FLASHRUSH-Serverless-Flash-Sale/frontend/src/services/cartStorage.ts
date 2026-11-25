import type { CartItem } from '../types/cart';
import type { Product } from '../types/product';

export const MAX_CART_ITEMS = 20;
export const CART_KEY = 'flashrush.cart.v1';
export const CART_CHANGED = 'flashrush:cart-changed';

function validItem(item: CartItem) {
  return item && typeof item.productId === 'string' && !!item.productId &&
    typeof item.name === 'string' && typeof item.image === 'string' &&
    Number.isSafeInteger(item.unitPrice) && item.unitPrice >= 0 &&
    Number.isSafeInteger(item.quantity) && item.quantity > 0 &&
    (item.selectedColor === undefined || typeof item.selectedColor === 'string') &&
    Array.isArray(item.additions) && item.additions.every(addition =>
      addition && typeof addition.id === 'string' && !!addition.id &&
      Number.isSafeInteger(addition.quantity) && addition.quantity > 0) &&
    totalQuantity(item.additions) === item.quantity;
}

export function readCart(): CartItem[] {
  const raw = localStorage.getItem(CART_KEY);
  if (!raw) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const products = new Set<string>();
  const additions = new Set<string>();
  return data.filter(item => {
    if (!validItem(item) || products.has(item.productId) || products.size >= MAX_CART_ITEMS ||
        new Set(item.additions.map((addition: CartItem['additions'][number]) => addition.id)).size !== item.additions.length ||
        item.additions.some((addition: CartItem['additions'][number]) => additions.has(addition.id))) return false;
    products.add(item.productId);
    for (const addition of item.additions) additions.add(addition.id);
    return true;
  });
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_CHANGED));
}

export const totalQuantity = (items: { quantity: number }[]) => items.reduce((sum, item) => sum + item.quantity, 0);
export const cartSubtotal = (items: CartItem[]) => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

export function changeQuantity(item: CartItem, quantity: number): CartItem {
  if (quantity > item.quantity) {
    return { ...item, quantity, additions: [...item.additions, { id: crypto.randomUUID(), quantity: quantity - item.quantity }] };
  }
  let remaining = quantity;
  const additions: CartItem['additions'] = [];
  for (const addition of item.additions) {
    if (remaining === 0) break;
    const kept = Math.min(remaining, addition.quantity);
    additions.push({ ...addition, quantity: kept });
    remaining -= kept;
  }
  return { ...item, quantity, additions };
}

export function withCartItem(items: CartItem[], product: Product, quantity: number, limit: number, selectedColor?: string) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Số lượng phải là số nguyên dương.');
  const existing = items.find(item => item.productId === product.productId);
  if (existing && existing.selectedColor !== selectedColor) {
    throw new Error('Sản phẩm đã có trong giỏ với lựa chọn màu khác. Hãy xóa dòng cũ để đổi màu.');
  }
  if (!existing && items.length >= MAX_CART_ITEMS) throw new Error(`Giỏ hàng tối đa ${MAX_CART_ITEMS} sản phẩm khác nhau.`);
  const nextQuantity = (existing?.quantity ?? 0) + quantity;
  if (nextQuantity > limit || !Number.isSafeInteger(nextQuantity)) {
    throw new Error(`Bạn có thể đặt tối đa ${limit} sản phẩm này.`);
  }
  const next = changeQuantity(existing ?? {
    productId: product.productId, name: product.name, image: product.images[0], unitPrice: product.price,
    selectedColor, quantity: 0, additions: [],
  }, nextQuantity);
  return existing ? items.map(item => item === existing ? next : item) : [...items, next];
}

export function withCartQuantity(items: CartItem[], productId: string, quantity: number, limit: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > limit) {
    throw new Error(`Hãy chọn số lượng từ 1 đến ${limit}.`);
  }
  return items.map(item => item.productId === productId ? changeQuantity(item, quantity) : item);
}

export function removePurchasedAdditions(ids: string[]) {
  const purchased = new Set(ids);
  const items = readCart();
  const remaining = items.flatMap(item => {
    const additions = item.additions.filter(addition => !purchased.has(addition.id));
    return additions.length ? [{ ...item, additions, quantity: totalQuantity(additions) }] : [];
  });
  if (totalQuantity(remaining) !== totalQuantity(items)) writeCart(remaining);
}
