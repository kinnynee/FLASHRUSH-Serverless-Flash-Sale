import { products } from '../mocks/products';
import type { Product } from '../types/product';

async function respond<T>(data: T): Promise<T> {
  await new Promise(resolve => setTimeout(resolve, 350));
  if (import.meta.env.VITE_DEMO_SERVICE_ERROR === 'true') throw new Error('Không thể tải sản phẩm demo. Vui lòng thử lại.');
  return structuredClone(data);
}
export const mockProductService = {
  getProducts: (): Promise<Product[]> => respond(products),
  getProductById: (productId: string): Promise<Product | undefined> => respond(products.find(p => p.productId === productId)),
};
