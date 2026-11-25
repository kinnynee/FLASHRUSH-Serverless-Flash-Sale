import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { products } from '../mocks/products';
import type { Campaign } from '../types/campaign';
import type { OrderRecord, PurchaseIntent } from '../types/order';
import type { Product } from '../types/product';
import { CART_KEY, MAX_CART_ITEMS, cartSubtotal, readCart, totalQuantity, withCartItem, withCartQuantity, writeCart } from './cartStorage';
import { quoteSelections } from './checkoutCatalog';
import { rememberCartCheckout, settleCartCheckout } from './orderStorage';

const a: Product = { ...products[0], productId: 'a', price: 100, stock: 5 };
const b: Product = { ...products[0], productId: 'b', price: 200, stock: 5 };
const now = Date.parse('2026-11-25T00:00:00Z');
const campaign: Campaign = {
  campaignId: 'active', name: 'Active', productIds: ['a', 'b'], maxQtyPerOrder: 3, status: 'ACTIVE',
  startTime: new Date(now - 1000).toISOString(), endTime: new Date(now + 1000).toISOString(),
};
const catalog = (products: Product[]) => ({ products: new Map(products.map(product => [product.productId, product])), campaigns: [campaign] });
const twoItems = () => withCartItem(withCartItem([], a, 1, 3), b, 1, 3);
const snapshot = (): PurchaseIntent => ({
  key: 'intent', createdAt: now, outcome: 'CONFIRMED', source: 'cart', items: readCart(),
  cartAdditionIds: readCart().flatMap(item => item.additions.map(addition => addition.id)),
});
const order = (status: OrderRecord['status']): OrderRecord => ({
  status, orderId: 'order', items: readCart(), totalQuantity: totalQuantity(readCart()), createdAt: now,
});

beforeEach(() => {
  function storage() {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
  }
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe('cart persistence and catalog validation', () => {
  it('merges duplicate products, changes quantities, removes a row and restores totals across reads', () => {
    const rows = withCartItem(twoItems(), a, 1, 3);
    expect(rows).toHaveLength(2);
    expect(totalQuantity(rows)).toBe(3);
    expect(cartSubtotal(rows)).toBe(400);
    writeCart(withCartQuantity(rows, 'a', 3, 3));
    expect(readCart()[0].quantity).toBe(3);
    writeCart(readCart().filter(item => item.productId !== 'b'));
    expect(cartSubtotal(readCart())).toBe(300);
    writeCart([]);
    expect(readCart()).toEqual([]);
  });

  it('rejects invalid quantities, alternate colors for an existing product, and a twenty-first product', () => {
    const rows = withCartItem([], a, 2, 3, 'Đen');
    expect(() => withCartItem(rows, a, 2, 3, 'Đen')).toThrow();
    expect(() => withCartItem(rows, a, 1, 3, 'Trắng')).toThrow();
    for (const quantity of [0, -1, 1.5]) expect(() => withCartQuantity(rows, 'a', quantity, 3)).toThrow();
    const full = Array.from({ length: MAX_CART_ITEMS }, (_, pos) => ({ ...rows[0], productId: String(pos) }));
    expect(() => withCartItem(full, a, 1, 3)).toThrow();
  });

  it('recovers empty from malformed JSON and filters invalid records without removing valid rows', () => {
    localStorage.setItem(CART_KEY, '{bad');
    expect(readCart()).toEqual([]);
    const [valid] = twoItems();
    localStorage.setItem(CART_KEY, JSON.stringify([null, { ...valid, quantity: -1 }, valid, valid]));
    expect(readCart()).toEqual([valid]);
  });

  it('reports new price, stock, missing products, expired campaign and a tightened campaign limit', () => {
    const rows = twoItems();
    const quote = quoteSelections(rows, catalog([{ ...a, price: 150 }, { ...b, stock: 0 }]), now);
    expect(quote[0]).toMatchObject({ priceChanged: true, item: { unitPrice: 150 }, limit: 3 });
    expect(quote[1].issue).toMatch(/hết hàng/i);
    expect(quoteSelections(rows, catalog([a]), now)[1].issue).toMatch(/danh mục/i);
    expect(quoteSelections(rows, catalog([a, b]), now + 2000)[0].issue).toMatch(/chiến dịch/i);
    expect(quoteSelections(withCartQuantity(rows, 'a', 4, 5), catalog([a, b]), now)[0].issue).toMatch(/tối đa 3/i);
    expect(rows[0].unitPrice).toBe(100);
    expect(rows).toHaveLength(2);
  });

  it('removes only the confirmed additions once and preserves re-added products', () => {
    writeCart(twoItems());
    rememberCartCheckout('order', snapshot());
    settleCartCheckout(order('PENDING'));
    expect(readCart()).toHaveLength(2);

    const aWithExtra = withCartItem(readCart(), a, 1, 3);
    writeCart(withCartItem(aWithExtra.filter(item => item.productId !== 'b'), b, 1, 3));
    const confirmed = order('CONFIRMED');
    settleCartCheckout(confirmed);
    expect(readCart().map(({ productId, quantity }) => [productId, quantity])).toEqual([['a', 1], ['b', 1]]);
    writeCart(withCartItem(readCart(), a, 1, 3));
    settleCartCheckout(confirmed);
    expect(readCart()[0].quantity).toBe(2);
  });

  it.each(['OUT_OF_STOCK', 'FAILED'] as const)('keeps the whole cart after %s and leaves buy-now independent', status => {
    const initial = twoItems();
    writeCart(initial);
    const pending = snapshot();
    rememberCartCheckout('order', pending);
    settleCartCheckout(order(status));
    rememberCartCheckout('order', { ...pending, source: 'buy-now' });
    settleCartCheckout(order('CONFIRMED'));
    expect(readCart()).toEqual(initial);
  });
});
