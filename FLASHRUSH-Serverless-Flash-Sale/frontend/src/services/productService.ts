import type { Product } from '../types/product';
import { mockProductService } from './mockProductService';

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
  return response.json();
}
export const productService: ProductService = import.meta.env.VITE_ORDER_MODE === 'http' ? {
  async getProducts() { return (await readCatalog('/products')).items; },
  async getProductById(id) { return readCatalog(`/products/${encodeURIComponent(id)}`); },
} : mockProductService;
