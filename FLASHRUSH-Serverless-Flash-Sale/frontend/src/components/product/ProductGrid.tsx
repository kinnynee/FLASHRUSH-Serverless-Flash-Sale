import type { Product } from '../../types/product';
import { ProductCard } from './ProductCard';
export function ProductGrid({ products }: { products: Product[] }) { return <div className="product-grid">{products.map(product => <ProductCard key={product.productId} product={product} />)}</div>; }
