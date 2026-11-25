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
  const untilStart = useCountdown(product.saleStartsAt || '1970-01-01T00:00:00.000Z');
  const upcoming = untilStart > 0;
  const ended = remaining === 0 && !upcoming;
  const soldOut = product.stock <= 0;
  return <article className="product-card"><Link to={`/products/${product.productId}`} className="product-image-link" aria-label={`Xem ${product.name}`}><ProductImage src={product.images[0]} alt={product.name} loading="lazy" /><DiscountBadge percent={discountPercent(product)} />{product.stock <= 3 && <span className="product-status">{product.stock ? 'SẮP HẾT' : 'HẾT HÀNG'}</span>}</Link><div className="product-card-body"><h3><Link to={`/products/${product.productId}`}>{product.name}</Link></h3><div className="card-price"><strong>{formatPrice(product.price)}</strong><del>{formatPrice(product.originalPrice)}</del></div><StockIndicator product={product} /><Link className={`button card-cta ${soldOut || ended ? 'button-secondary' : 'button-primary'}`} to={`/products/${product.productId}`}><ShoppingBag size={15} />{soldOut ? 'Hết hàng' : upcoming ? 'Sắp mở bán' : ended ? 'Đã kết thúc' : 'Mua ngay'}</Link></div></article>;
}
