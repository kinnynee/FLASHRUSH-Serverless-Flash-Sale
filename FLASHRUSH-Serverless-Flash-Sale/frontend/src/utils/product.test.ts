import { describe, expect, it } from 'vitest';
import { clampQuantity, checkoutUrl, discountPercent, filterProducts, remainingSeconds, soldPercent } from './product';
import type { Product } from '../types/product';

const base: Product = { productId: 'headphones', name: 'Tai nghe chống ồn', description: 'Demo', category: 'Tai nghe', price: 1000000, originalPrice: 2000000, stock: 3, initialStock: 50, images: [], isFlashSale: true, saleEndsAt: '2030-01-01T00:00:00Z' };
const catalog = [base, { ...base, productId: 'keyboard', name: 'Bàn phím', category: 'Bàn phím', price: 500000, originalPrice: 1500000 }, { ...base, productId: 'premium', price: 3000000, originalPrice: 4000000, stock: 0 }];
const filters = { query: '', category: '', minPrice: 0, maxPrice: Infinity, sort: 'discount' };
describe('Product discovery', () => {
  it('combines accent-insensitive search, category and inclusive price range', () => {
    expect(filterProducts(catalog, { ...filters, query: 'TAI NGHE CHONG ON', category: 'Tai nghe', minPrice: 1000000, maxPrice: 1000000 }).map(p => p.productId)).toEqual(['headphones']);
  });
  it('sorts numerically by ascending and descending prices without mutating the catalog', () => {
    expect(filterProducts(catalog, { ...filters, sort: 'price-asc' }).map(p => p.productId)).toEqual(['keyboard', 'headphones', 'premium']);
    expect(filterProducts(catalog, { ...filters, sort: 'price-desc' }).map(p => p.productId)).toEqual(['premium', 'headphones', 'keyboard']);
    expect(catalog[0].productId).toBe('headphones');
  });
  it('sorts by actual discount and yields empty results for impossible criteria', () => {
    expect(filterProducts(catalog, filters)[0].productId).toBe('keyboard');
    expect(filterProducts(catalog, { ...filters, minPrice: 5000000 })).toEqual([]);
    expect(filterProducts(catalog, { ...filters, query: 'not-a-product' })).toEqual([]);
  });
});
describe('Sale boundaries and checkout contract', () => {
  it('clamps quantity to available stock, including manual and invalid input', () => {
    expect(clampQuantity(99, 3)).toBe(3);
    expect(clampQuantity(-1, 3)).toBe(1);
    expect(clampQuantity(NaN, 3)).toBe(1);
    expect(clampQuantity(2.7, 3)).toBe(2);
    expect(clampQuantity(1, 0)).toBe(0);
  });
  it('uses the deadline, catching up after tab suspension and stopping at zero', () => {
    const target = '2030-01-01T00:00:00Z';
    const end = Date.parse(target);
    expect(remainingSeconds(target, end - 75000)).toBe(75);
    expect(remainingSeconds(target, end - 5000)).toBe(5);
    expect(remainingSeconds(target, end + 1000)).toBe(0);
    expect(remainingSeconds('invalid', end)).toBe(0);
  });
  it('prepares an encoded checkout URL without changing stock', () => {
    const url = checkoutUrl({ productId: base.productId, quantity: 2, selectedColor: 'Xanh đậm' });
    const params = new URL(url, 'https://example.test').searchParams;
    expect(params.get('productId')).toBe('headphones');
    expect(params.get('quantity')).toBe('2');
    expect(params.get('color')).toBe('Xanh đậm');
    expect(base.stock).toBe(3);
  });
  it('computes discount and stock progress within valid bounds', () => {
    expect(discountPercent(base)).toBe(50);
    expect(soldPercent(base)).toBe(94);
    expect(soldPercent({ ...base, stock: 0 })).toBe(100);
    expect(soldPercent({ ...base, initialStock: 0 })).toBe(0);
  });
});
