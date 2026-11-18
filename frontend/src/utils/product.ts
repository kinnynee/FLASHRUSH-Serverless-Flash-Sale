import type { CheckoutIntent, Product } from '../types/product';

export const formatPrice = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export const discountPercent = (product: Product) => product.originalPrice > 0 ? Math.max(0, Math.round((1 - product.price / product.originalPrice) * 100)) : 0;
export const soldPercent = (product: Product) => product.initialStock > 0 ? Math.min(100, Math.max(0, Math.round((1 - product.stock / product.initialStock) * 100))) : 0;
export const remainingSeconds = (target: string, now = Date.now()) => Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1000) || 0);
export const clampQuantity = (quantity: number, stock: number) => stock < 1 ? 0 : Math.min(stock, Math.max(1, Math.floor(quantity) || 1));
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

export interface ProductFilters { query: string; category: string; minPrice: number; maxPrice: number; sort: string; }
export function filterProducts(products: Product[], filters: ProductFilters) {
  const result = products.filter(p => normalize(p.name).includes(normalize(filters.query)) && (!filters.category || p.category === filters.category) && p.price >= filters.minPrice && p.price <= filters.maxPrice);
  return result.sort((a, b) => filters.sort === 'price-asc' ? a.price - b.price : filters.sort === 'price-desc' ? b.price - a.price : filters.sort === 'popular' ? soldPercent(b) - soldPercent(a) : discountPercent(b) - discountPercent(a));
}
export function checkoutUrl(intent: CheckoutIntent) {
  const params = new URLSearchParams({ productId: intent.productId, quantity: String(intent.quantity) });
  if (intent.selectedColor) params.set('color', intent.selectedColor);
  return `/checkout?${params}`;
}
