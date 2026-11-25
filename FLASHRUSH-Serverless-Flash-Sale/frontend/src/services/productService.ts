import type { Product } from '../types/product';
import { mockProductService } from './mockProductService';
import { syncServerTime } from '../utils/serverClock';

export interface ProductService {
  getProducts(): Promise<Product[]>;
  getProductById(productId: string): Promise<Product | undefined>;
}
async function readCatalog(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('Chưa cấu hình API sản phẩm.');
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(10000) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('Không thể tải sản phẩm.');
  const data = await response.json();
  if (data && typeof data === 'object') syncServerTime((data as Record<string, unknown>).serverTime);
  return data;
}
function product(value: unknown): Product {
  if (!value || typeof value !== 'object') throw new Error('Dữ liệu sản phẩm không hợp lệ.');
  const item = value as Record<string, unknown>;
  for (const field of ['productId', 'name', 'description', 'category', 'saleEndsAt']) {
    if (typeof item[field] !== 'string') throw new Error('Dữ liệu sản phẩm không hợp lệ.');
  }
  for (const field of ['price', 'originalPrice', 'stock', 'initialStock']) {
    if (typeof item[field] !== 'number' || !Number.isFinite(item[field]) || Number(item[field]) < 0) throw new Error('Dữ liệu sản phẩm không hợp lệ.');
  }
  if (!Number.isInteger(item.stock) || !Number.isInteger(item.initialStock) || !Number.isFinite(Date.parse(String(item.saleEndsAt))) ||
      typeof item.isFlashSale !== 'boolean' || !Array.isArray(item.images) || item.images.length === 0 || item.images.some(image => typeof image !== 'string') ||
      (item.colors !== undefined && (!Array.isArray(item.colors) || item.colors.some(color => typeof color !== 'string'))) ||
      (item.specs !== undefined && (!Array.isArray(item.specs) || item.specs.some(spec => !spec || ['label', 'value', 'detail'].some(key => typeof spec[key] !== 'string'))))) {
    throw new Error('Dữ liệu sản phẩm không hợp lệ.');
  }
  return item as unknown as Product;
}
export const productService: ProductService = import.meta.env.VITE_ORDER_MODE === 'http' ? {
  async getProducts() {
    const data = await readCatalog('/products');
    if (!data || !Array.isArray(data.items)) throw new Error('Danh sách sản phẩm không hợp lệ.');
    return data.items.map(product);
  },
  async getProductById(id) { const data = await readCatalog(`/products/${encodeURIComponent(id)}`); return data === undefined ? undefined : product(data); },
} : mockProductService;
