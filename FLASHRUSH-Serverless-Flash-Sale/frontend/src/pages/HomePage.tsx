import { useState } from 'react';
import { ArrowRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useStorefrontCampaigns } from '../hooks/useStorefrontCampaigns';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { ProductGrid } from '../components/product/ProductGrid';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { SaleSchedule } from '../components/product/SaleSchedule';
import { catalogCategories, saleDeadline } from '../utils/storefront';
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
  const deadline = saleDeadline(selected ? [selected] : visibleCampaigns, now);
  const busy = loading || campaignsLoading;
  const failure = error || campaignsError;
  const listingLink = '/products?status=' + status + (selected ? '&campaignId=' + encodeURIComponent(selected.campaignId) : '');
  return <div className="container home-page">
    <section className="promo-banner" aria-label="Khuyến mãi công nghệ FLASHRUSH">
      <h1 className="sr-only">FLASHRUSH — Khuyến mãi công nghệ</h1>
      <Link className="promo-banner-link" to="/products?status=ALL" aria-label="Mua ngay — Xem sản phẩm Flash Sale">
        <img src="/images/flashrush-promo-banner.png" width={1536} height={768} fetchPriority="high"
          alt="FLASHRUSH: nhập mã HAUMON, giảm 36,36%, áp dụng cho đơn hàng từ 3,6 triệu đồng trở lên. Mua ngay." />
      </Link>
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
