import type { Product } from '../types/product';
import { mockProductService } from './mockProductService';

export interface ProductService {
  getProducts(): Promise<Product[]>;
  getProductById(productId: string): Promise<Product | undefined>;
}
// Replace only this adapter when API Gateway is available.
export const productService: ProductService = mockProductService;
