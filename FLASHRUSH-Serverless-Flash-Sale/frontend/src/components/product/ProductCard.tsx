import { useState } from 'react';
import { ShoppingCart, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product } from '../../types/product';
import type { Campaign } from '../../types/campaign';
import { checkoutUrl, discountPercent, formatPrice } from '../../utils/product';
import { campaignOffer } from '../../utils/campaign';
import { useCountdown } from '../../hooks/useCountdown';
import { useCart } from '../../contexts/CartContext';
import { Button } from '../common/Button';
import { DiscountBadge } from './DiscountBadge';
import { StockIndicator } from './StockIndicator';
import { ProductImage } from '../common/ProductImage';

export function ProductCard({ product, campaigns }: { product: Product; campaigns: Campaign[] }) {
  const offer = campaignOffer(campaigns, product.productId);
  const remaining = useCountdown(offer?.endsAt ?? product.saleEndsAt);
  const available = !!offer && remaining > 0 && product.stock > 0;
  const productUrl = `/products/${encodeURIComponent(product.productId)}`;
  const { addItem } = useCart();
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);

  function add() {
    if (!offer || !available) return;
    try {
      addItem(product, 1, Math.min(product.stock, offer.limit), product.colors?.[0]);
      setFailed(false);
      setFeedback('Đã thêm vào giỏ hàng.');
    } catch (error) {
      setFailed(true);
      setFeedback(error instanceof Error ? error.message : 'Không thể thêm sản phẩm.');
    }
  }

  return <article className="product-card">
    <Link to={productUrl} className="product-image-link" aria-label={`Xem ${product.name}`}>
      <ProductImage src={product.images[0]} alt={product.name} loading="lazy" />
      <DiscountBadge percent={discountPercent(product)} />
      {product.stock <= 3 && <span className="product-status">{product.stock ? 'SẮP HẾT' : 'HẾT HÀNG'}</span>}
    </Link>
    <div className="product-card-body">
      <h3><Link to={productUrl}>{product.name}</Link></h3>
      <div className="card-price"><strong>{formatPrice(product.price)}</strong><del>{formatPrice(product.originalPrice)}</del></div>
      <StockIndicator product={product} />
      {available ? <div className="card-purchase">
        <Button variant="secondary" onClick={add}><ShoppingCart size={15} /> Thêm vào giỏ</Button>
        <Link className="button button-primary" to={checkoutUrl({ productId: product.productId, quantity: 1 })}><Zap size={15} /> Mua ngay</Link>
      </div> : <Link className="button button-secondary card-cta" to={productUrl}>
        {product.stock ? 'Xem sản phẩm · Ngoài phiên' : 'Xem sản phẩm · Hết hàng'}
      </Link>}
      {feedback && <small className={failed ? 'order-error' : 'cart-feedback'} role={failed ? 'alert' : 'status'}>{feedback}</small>}
    </div>
  </article>;
}
