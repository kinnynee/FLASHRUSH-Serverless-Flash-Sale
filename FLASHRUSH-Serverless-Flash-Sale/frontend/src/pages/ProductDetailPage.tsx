import { useCountdown } from '../hooks/useCountdown';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BatteryCharging, Bluetooth, ChevronRight, Cpu, ShieldCheck, Zap } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { useCampaigns } from '../hooks/useCampaigns';
import { discountPercent, formatPrice, checkoutUrl } from '../utils/product';
import { Button } from '../components/common/Button';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { StockIndicator } from '../components/product/StockIndicator';
import { QuantitySelector } from '../components/product/QuantitySelector';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProductImage } from '../components/common/ProductImage';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import type { Product } from '../types/product';
import { getServerNow } from '../utils/serverClock';

function ProductDetail({ product, related }: { product: Product; related: Product[] }) {
  const { campaigns, loading: campaignsLoading, error: campaignsError } = useCampaigns();
  const [imageIndex, setImageIndex] = useState(0);
  const [color, setColor] = useState(product.colors?.[0] || '');
  const [quantity, setQuantity] = useState(product.stock ? 1 : 0);
  const [intent, setIntent] = useState('');
  const navigate = useNavigate();
  const serverNow = getServerNow();
  const activeCampaigns = campaigns.filter(campaign => serverNow >= Date.parse(campaign.saleStartsAt || campaign.startTime) &&
    serverNow <= Date.parse(campaign.saleEndsAt || campaign.endTime) && campaign.productIds.includes(product.productId));
  const campaignLimit = activeCampaigns
    .reduce<number | undefined>((limit, campaign) => limit === undefined ? campaign.maxQtyPerOrder : Math.min(limit, campaign.maxQtyPerOrder), undefined);
  const saleEndsAt = product.saleEndsAt || activeCampaigns.map(campaign => campaign.endTime).sort((a, b) => Date.parse(a) - Date.parse(b))[0] || '';
  const saleStartsAt = product.saleStartsAt || activeCampaigns[0]?.startTime || saleEndsAt;
  const untilStart = useCountdown(saleStartsAt);
  const seconds = useCountdown(saleEndsAt);
  const upcoming = untilStart > 0;
  const maximumQuantity = Math.min(product.stock, campaignLimit ?? product.stock);
  const available = product.stock > 0 && !upcoming && seconds > 0 && !campaignsError && (campaignsLoading || campaignLimit !== undefined);
  const specIcons = [BatteryCharging, Cpu, Bluetooth, ShieldCheck];
  function prepareCheckout() {
    if (!available || quantity < 1 || quantity > maximumQuantity) return;
    navigate(checkoutUrl({ productId: product.productId, quantity, selectedColor: color || undefined }));
  }
  return <div className="container detail-page"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Trang chủ</Link><ChevronRight size={12} /><Link to={`/products?category=${encodeURIComponent(product.category)}`}>{product.category}</Link><ChevronRight size={12} /><span>{product.name}</span></nav><div className="detail-grid"><div className="detail-left"><section className="gallery" aria-label="Ảnh sản phẩm"><div className="main-photo"><span className="gallery-badge"><Zap size={13} /> GIẢM {discountPercent(product)}%</span><ProductImage src={product.images[imageIndex]} alt={`${product.name} — ảnh ${imageIndex + 1}`} /><span className="photo-caption">Ảnh sản phẩm chính hãng</span></div><div className="thumbnails">{product.images.map((src, index) => <button key={src} className={index === imageIndex ? 'selected' : ''} aria-label={`Xem ảnh ${index + 1}`} aria-pressed={index === imageIndex} onClick={() => setImageIndex(index)}><ProductImage src={src} alt="" /></button>)}</div></section>{product.specs && <section className="spec-panel"><div className="section-heading"><h2>Thông số then chốt</h2><small>Thông số kỹ thuật</small></div><div className="spec-grid">{product.specs.map((spec, index) => { const Icon = specIcons[index % specIcons.length]; return <div className="spec" key={spec.label}><Icon size={20} /><span>{spec.label}</span><strong>{spec.value}</strong><small>{spec.detail}</small></div>; })}</div></section>}<section className="description-panel"><h2>Về sản phẩm</h2><p>{product.description}</p></section></div><div className="detail-right"><div className="flash-banner"><strong><Zap size={20} /> FLASH SALE</strong><CountdownTimer target={upcoming ? saleStartsAt : saleEndsAt} label={upcoming ? 'Mở bán trong:' : undefined} /></div><section className="purchase-panel"><h1>{product.name}</h1><div className="detail-pricing"><div><strong>{formatPrice(product.price)}</strong><del>{formatPrice(product.originalPrice)}</del></div><span>Tiết kiệm<br /><b>{formatPrice(product.originalPrice - product.price)}</b> (-{discountPercent(product)}%)</span></div><p className="scarcity">{product.stock ? `Chỉ còn ${product.stock} sản phẩm với giá ưu đãi này` : 'Sản phẩm đã hết hàng'}</p><StockIndicator product={product} />{product.colors && <fieldset className="color-options"><legend>Màu sắc: <strong>{color}</strong></legend><div>{product.colors.map((item, index) => <button key={item} className={item === color ? 'selected' : ''} aria-pressed={item === color} onClick={() => { setColor(item); setIntent(''); }}><span className={`color-swatch swatch-${index}`} />{item}</button>)}</div></fieldset>}<div className="quantity-row"><span>Số lượng:</span><QuantitySelector value={quantity} stock={maximumQuantity} disabled={!available} onChange={value => { setQuantity(value); setIntent(''); }} /><small>Tối đa {maximumQuantity} chiếc / đơn</small></div>{campaignsError && <p className="campaign-error" role="alert">{campaignsError}</p>}{!campaignsLoading && !campaignLimit && !campaignsError && <p className="campaign-error" role="status">Sản phẩm hiện không thuộc chiến dịch đang diễn ra.</p>}<Button className="buy-button" disabled={!available} onClick={prepareCheckout}><Zap size={19} />{!product.stock ? 'SẢN PHẨM ĐÃ HẾT HÀNG' : upcoming ? 'SẮP MỞ BÁN' : !seconds ? 'ĐÃ KẾT THÚC' : 'MUA NGAY GIÁ FLASH SALE'}</Button></section></div></div>{related.length > 0 && <section className="related-products"><div className="section-heading"><h2>Có thể bạn cũng thích</h2><Link to="/products" className="text-link">Xem tất cả <ChevronRight size={16} /></Link></div><ProductGrid products={related} /></section>}</div>;
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
