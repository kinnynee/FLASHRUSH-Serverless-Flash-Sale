import { BatteryCharging, Bluetooth, ChevronRight, Cpu, ShieldCheck, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useCountdown } from '../hooks/useCountdown';
import type { Product } from '../types/product';
import { checkoutUrl, discountPercent, formatPrice } from '../utils/product';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ProductImage } from '../components/common/ProductImage';
import { StockIndicator } from '../components/product/StockIndicator';
import { QuantitySelector } from '../components/product/QuantitySelector';
import { ProductGrid } from '../components/product/ProductGrid';

function ProductDetail({ product, related }: { product: Product; related: Product[] }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [color, setColor] = useState(product.colors?.[0] || '');
  const [quantity, setQuantity] = useState(product.stock ? 1 : 0);
  const [intent, setIntent] = useState('');
  const navigate = useNavigate();
  const seconds = useCountdown(product.saleEndsAt);
  const available = product.stock > 0 && seconds > 0;
  const specIcons = [BatteryCharging, Cpu, Bluetooth, ShieldCheck];
  function prepareCheckout() {
    if (!available || quantity < 1 || quantity > product.stock) return;
    navigate(checkoutUrl({ productId: product.productId, quantity, selectedColor: color || undefined }));
  }
  return <div className="container detail-page"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Trang chủ</Link><ChevronRight size={12} /><Link to={`/products?category=${encodeURIComponent(product.category)}`}>{product.category}</Link><ChevronRight size={12} /><span>{product.name}</span></nav><div className="detail-grid"><div className="detail-left"><section className="gallery" aria-label="Ảnh sản phẩm"><div className="main-photo"><span className="gallery-badge"><Zap size={13} /> GIẢM {discountPercent(product)}%</span><ProductImage src={product.images[imageIndex]} alt={`${product.name} — ảnh minh họa ${imageIndex + 1}`} /><span className="photo-caption">Ảnh minh họa • Màu sắc có thể khác sản phẩm demo</span></div><div className="thumbnails">{product.images.map((src, index) => <button key={src} className={index === imageIndex ? 'selected' : ''} aria-label={`Xem ảnh ${index + 1}`} aria-pressed={index === imageIndex} onClick={() => setImageIndex(index)}><ProductImage src={src} alt="" /></button>)}</div></section>{product.specs && <section className="spec-panel"><div className="section-heading"><h2>Thông số then chốt</h2><small>Thông số mô phỏng</small></div><div className="spec-grid">{product.specs.map((spec, index) => { const Icon = specIcons[index % specIcons.length]; return <div className="spec" key={spec.label}><Icon size={20} /><span>{spec.label}</span><strong>{spec.value}</strong><small>{spec.detail}</small></div>; })}</div></section>}<section className="description-panel"><h2>Về sản phẩm</h2><p>{product.description}</p></section></div><div className="detail-right"><div className="flash-banner"><strong><Zap size={20} /> FLASH SALE</strong><CountdownTimer target={product.saleEndsAt} /></div><section className="purchase-panel"><h1>{product.name}</h1><span className="demo-badge">Dữ liệu mô phỏng</span><div className="detail-pricing"><div><strong>{formatPrice(product.price)}</strong><del>{formatPrice(product.originalPrice)}</del></div><span>Tiết kiệm<br /><b>{formatPrice(product.originalPrice - product.price)}</b> (-{discountPercent(product)}%)</span></div><p className="scarcity">{product.stock ? `Chỉ còn ${product.stock} sản phẩm với giá ưu đãi này` : 'Sản phẩm đã hết hàng trong phiên demo'}</p><StockIndicator product={product} />{product.colors && <fieldset className="color-options"><legend>Màu sắc: <strong>{color}</strong></legend><div>{product.colors.map((item, index) => <button key={item} className={item === color ? 'selected' : ''} aria-pressed={item === color} onClick={() => { setColor(item); setIntent(''); }}><span className={`color-swatch swatch-${index}`} />{item}</button>)}</div></fieldset>}<div className="quantity-row"><span>Số lượng:</span><QuantitySelector value={quantity} stock={product.stock} disabled={!available} onChange={value => { setQuantity(value); setIntent(''); }} /><small>Tối đa {product.stock} chiếc</small></div><Button className="buy-button" disabled={!available} onClick={prepareCheckout}><Zap size={19} />{!product.stock ? 'SẢN PHẨM ĐÃ HẾT HÀNG' : !seconds ? 'PHIÊN FLASH SALE ĐÃ KẾT THÚC' : 'MUA NGAY GIÁ FLASH SALE'}</Button>{intent && <div className="checkout-notice" role="status"><strong>Đã chuẩn bị lựa chọn của bạn</strong><p>{quantity} × {product.name}{color && ` · ${color}`}</p><p>Checkout đang chờ Developer 2 tích hợp. Chưa tạo đơn hàng, chưa giữ hàng và chưa thanh toán.</p><details><summary>Thông tin bàn giao Checkout</summary><code>{intent}</code></details><button className="text-link" onClick={() => setIntent('')}>Đóng thông báo</button></div>}</section><aside className="stock-note"><ShieldCheck size={24} /><div><strong>Lưu ý về tồn kho</strong><p>Tồn kho hiển thị chỉ mang tính tham khảo và có thể thay đổi trước khi xác nhận đơn hàng. Bản demo không giữ hàng khi nhấn mua.</p></div></aside></div></div>{related.length > 0 && <section className="related-products"><div className="section-heading"><h2>Có thể bạn cũng thích</h2><Link to="/products" className="text-link">Xem tất cả <ChevronRight size={16} /></Link></div><ProductGrid products={related} /></section>}</div>;
}
export function ProductDetailPage() {
  const { productId } = useParams();
  const { products, loading, error, retry } = useProducts();
  if (loading) return <div className="container page-state"><LoadingSkeleton count={2} /></div>;
  if (error) return <div className="container"><EmptyState error title="Không thể tải sản phẩm" description={error}><Button onClick={retry}>Thử lại</Button></EmptyState></div>;
  const product = products.find(item => item.productId === productId);
  if (!product) return <div className="container"><EmptyState title="Không tìm thấy sản phẩm" description="Sản phẩm không tồn tại hoặc đường dẫn chưa đúng."><Link className="button button-primary" to="/products">Xem tất cả sản phẩm</Link></EmptyState></div>;
  const related = [...products.filter(item => item.productId !== productId && item.category === product.category), ...products.filter(item => item.productId !== productId && item.category !== product.category)].slice(0, 4);
  return <ProductDetail key={product.productId} product={product} related={related} />;
}
