import { useState } from 'react';
import { ArrowRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useStorefrontCampaigns } from '../hooks/useStorefrontCampaigns';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProductImage } from '../components/common/ProductImage';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { SaleSchedule } from '../components/product/SaleSchedule';
import { catalogCategories, saleDeadline } from '../utils/storefront';
import { discountPercent, formatPrice } from '../utils/product';
import type { CampaignStatus } from '../types/campaign';

const statuses: { value: CampaignStatus | 'ALL'; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang diễn ra' }, { value: 'UPCOMING', label: 'Sắp mở bán' },
  { value: 'ENDED', label: 'Đã kết thúc' }, { value: 'ALL', label: 'Tất cả' },
];
export function HomePage() {
  const { products, loading, error, retry } = useProducts();
  const { campaigns, now, loading: campaignsLoading, error: campaignsError, retry: retryCampaigns } = useStorefrontCampaigns();
  const [status, setStatus] = useState<CampaignStatus | 'ALL'>('ACTIVE');
  const [campaignId, setCampaignId] = useState('');
  const visibleCampaigns = campaigns.filter(c => status === 'ALL' || c.status === status);
  const selected = visibleCampaigns.find(c => c.campaignId === campaignId);
  const productIds = new Set((selected ? [selected] : visibleCampaigns).flatMap(c => c.productIds));
  const visibleProducts = products.filter(p => productIds.has(p.productId));
  const featured = [...visibleProducts].sort((a, b) => discountPercent(b) - discountPercent(a))[0];
  const deadline = saleDeadline(selected ? [selected] : visibleCampaigns, now);
  const busy = loading || campaignsLoading;
  const failure = error || campaignsError;
  const listingLink = '/products?status=' + status + (selected ? '&campaignId=' + encodeURIComponent(selected.campaignId) : '');
  return <div className="container home-page">
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><Zap size={14} fill="currentColor" /> FLASHRUSH / FLASH SALE</span>
        <h1>Chớp thời điểm.<br />Săn giá tốt.</h1><p>Khám phá công nghệ, chọn ưu đãi dành cho bạn.</p>
        <Link className="button button-primary hero-cta" to="/products?status=ALL">Khám phá sản phẩm <ArrowRight size={17} /></Link>
      </div>
      {!busy && !failure && featured ? <Link className="hero-feature" to={'/products/' + featured.productId}>
        <div><span className="section-kicker">NỔI BẬT TRONG ĐỢT</span><h2>{featured.name}</h2><strong>{formatPrice(featured.price)}</strong><span>Giảm {discountPercent(featured)}% <ArrowRight size={16} /></span></div>
        <ProductImage src={featured.images[0]} alt={featured.name} fetchPriority="high" />
      </Link> : <div className="hero-art" aria-hidden="true"><Zap /><span>FLASH<br />RUSH.</span></div>}
    </section>
    <section className="sale-section" aria-labelledby="featured-title">
      <div className="section-heading sale-heading"><div><span className="section-kicker">ƯU ĐÃI THEO KHUNG GIỜ</span><h2 id="featured-title"><Zap fill="currentColor" /> FLASH SALE</h2></div>
        {!busy && !failure && deadline && <CountdownTimer {...deadline} />}<Link className="text-link" to={listingLink}>Xem tất cả <ArrowRight size={16} /></Link></div>
      <div className="sale-sessions" aria-label="Trạng thái Đợt Flash Sale">{statuses.map(item => <button key={item.value} className={'session ' + (status === item.value ? 'active' : '')} onClick={() => { setStatus(item.value); setCampaignId(''); }} aria-pressed={status === item.value}><strong>{item.label}</strong><small>{busy ? 'Đang tải…' : campaigns.filter(c => item.value === 'ALL' || c.status === item.value).length + ' đợt Flash Sale'}</small></button>)}</div>
      {!busy && !failure && <SaleSchedule campaigns={visibleCampaigns} selectedId={selected?.campaignId || ''} onSelect={setCampaignId} />}
      <nav className="category-links" aria-label="Danh mục sản phẩm"><Link to="/products?status=ALL">Tất cả danh mục</Link>{catalogCategories(products).map(category => <Link key={category} to={'/products?status=ALL&category=' + encodeURIComponent(category)}>{category}</Link>)}</nav>
      {busy ? <LoadingSkeleton count={12} /> : failure ? <EmptyState error title="Chưa tải được ưu đãi" description={failure.replace(/chiến dịch/gi, 'đợt Flash Sale')}><Button onClick={() => { retry(); retryCampaigns(); }}>Thử lại</Button></EmptyState> : visibleProducts.length ? <ProductGrid products={visibleProducts.slice(0, 12)} /> : <EmptyState title="Chưa có sản phẩm trong khung giờ này" description="Chọn trạng thái khác để khám phá các đợt Flash Sale."><Button onClick={() => { setStatus('ALL'); setCampaignId(''); }}>Xem tất cả đợt Flash Sale</Button></EmptyState>}
    </section>
  </div>;
}
