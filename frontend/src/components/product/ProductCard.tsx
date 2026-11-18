import { ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product } from '../../types/product';
import { discountPercent, formatPrice } from '../../utils/product';
import { useCountdown } from '../../hooks/useCountdown';
import { DiscountBadge } from './DiscountBadge';
import { StockIndicator } from './StockIndicator';
import { ProductImage } from '../common/ProductImage';
export function ProductCard({ product }: { product: Product }) {
  const remaining = useCountdown(product.saleEndsAt);
  return <article className="product-card"><Link to={`/products/${product.productId}`} className="product-image-link" aria-label={`Xem ${product.name}`}><ProductImage src={product.images[0]} alt={product.name} loading="lazy" /><DiscountBadge percent={discountPercent(product)} />{product.stock <= 3 && <span className="product-status">{product.stock ? 'SẮP HẾT' : 'HẾT HÀNG'}</span>}</Link><div className="product-card-body"><h3><Link to={`/products/${product.productId}`}>{product.name}</Link></h3><div className="card-price"><strong>{formatPrice(product.price)}</strong><del>{formatPrice(product.originalPrice)}</del></div><StockIndicator product={product} /><Link className={`button card-cta ${!product.stock || !remaining ? 'button-secondary' : 'button-primary'}`} to={`/products/${product.productId}`}><ShoppingBag size={15} />{!product.stock ? 'Xem sản phẩm · Hết hàng' : !remaining ? 'Xem sản phẩm · Hết phiên' : 'Xem ưu đãi'}</Link></div></article>;
}
