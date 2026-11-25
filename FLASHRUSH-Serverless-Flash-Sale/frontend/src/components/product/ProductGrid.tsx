import type { Product } from '../../types/product';
import type { Campaign } from '../../types/campaign';
import { ProductCard } from './ProductCard';

export function ProductGrid({ products, campaigns }: { products: Product[]; campaigns: Campaign[] }) {
  return <div className="product-grid">
    {products.map(product => <ProductCard key={product.productId} product={product} campaigns={campaigns} />)}
  </div>;
}
