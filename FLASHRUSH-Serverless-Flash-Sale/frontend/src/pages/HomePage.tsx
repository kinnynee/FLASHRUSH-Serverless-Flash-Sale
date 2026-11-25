import { useState } from 'react';
import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useStorefrontCampaigns } from '../hooks/useStorefrontCampaigns';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProductImage } from '../components/common/ProductImage';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { catalogCategories, saleDeadline } from '../utils/storefront';
import { discountPercent, formatPrice } from '../utils/product';

const sessionLabels = { ACTIVE: 'Đang diễn ra', UPCOMING: 'Sắp mở bán', ENDED: 'Đã kết thúc' };
const sessionTime = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });

export function HomePage() {
  const { products, loading, error, retry } = useProducts();
  const { campaigns, now, loading: campaignsLoading, error: campaignsError, retry: retryCampaigns } = useStorefrontCampaigns();
  const [campaignId, setCampaignId] = useState('');
  const selected = campaigns.find(campaign => campaign.campaignId === campaignId)
    || campaigns.find(campaign => campaign.status === 'ACTIVE') || campaigns.find(campaign => campaign.status === 'UPCOMING') || campaigns[0];
  const visibleCampaigns = selected ? [selected] : [];
  const productIds = new Set(visibleCampaigns.flatMap(c => c.productIds));
  const visibleProducts = products.filter(p => productIds.has(p.productId));
  const featured = [...visibleProducts].sort((a, b) => discountPercent(b) - discountPercent(a))[0];
  const deadline = saleDeadline(visibleCampaigns, now);
  const busy = loading || campaignsLoading;
  const failure = error || campaignsError;
  const listingLink = '/products?status=ALL' + (selected ? '&campaignId=' + encodeURIComponent(selected.campaignId) : '');
  return <div className="container home-page">
    <section className="hero">
      <div className="hero-copy">
        <h1>Săn giá tốt.</h1>
        <Link className="button button-primary hero-cta" to="/products?status=ALL">Khám phá sản phẩm</Link>
      </div>
      {!busy && !failure && featured ? <Link className="hero-feature" to={'/products/' + featured.productId}>
        <div><h2>{featured.name}</h2><strong>{formatPrice(featured.price)}</strong><span>Giảm {discountPercent(featured)}%</span></div>
        <ProductImage src={featured.images[0]} alt={featured.name} fetchPriority="high" />
      </Link> : <div className="hero-art" aria-hidden="true"><Zap /><span>FLASH<br />RUSH.</span></div>}
    </section>
    <section className="sale-section" aria-labelledby="featured-title">
      <div className="section-heading sale-heading"><div><h2 id="featured-title"><Zap fill="currentColor" /> FLASH SALE</h2></div>
        {!busy && !failure && deadline && <CountdownTimer {...deadline} />}<Link className="text-link" to={listingLink}>Xem tất cả</Link></div>
      {!busy && !failure && campaigns.length > 0 && <nav className="sale-sessions campaign-sessions" aria-label="Khung giờ Flash Sale">
        {[...campaigns].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)).map(campaign => <button
          key={campaign.campaignId}
          className={'session ' + (selected?.campaignId === campaign.campaignId ? 'active' : '')}
          onClick={() => setCampaignId(campaign.campaignId)}
          aria-pressed={selected?.campaignId === campaign.campaignId}
        >
          <strong>{sessionLabels[campaign.status]}</strong>
          <small>
          <time dateTime={campaign.saleStartsAt || campaign.startTime}>{sessionTime.format(new Date(campaign.saleStartsAt || campaign.startTime))}</time>
          <span> – </span>
          <time dateTime={campaign.saleEndsAt || campaign.endTime}>{sessionTime.format(new Date(campaign.saleEndsAt || campaign.endTime))}</time>
          </small>
        </button>)}
      </nav>}
      <nav className="category-links" aria-label="Danh mục sản phẩm"><Link to="/products?status=ALL">Tất cả danh mục</Link>{catalogCategories(products).map(category => <Link key={category} to={'/products?status=ALL&category=' + encodeURIComponent(category)}>{category}</Link>)}</nav>
      {busy ? <LoadingSkeleton count={12} /> : failure ? <EmptyState error title="Chưa tải được ưu đãi" description={failure.replace(/chiến dịch/gi, 'đợt Flash Sale')}><Button onClick={() => { retry(); retryCampaigns(); }}>Thử lại</Button></EmptyState> : visibleProducts.length ? <ProductGrid products={visibleProducts.slice(0, 12)} /> : <EmptyState title="Chưa có sản phẩm trong phiên này" description="Chọn khung giờ khác hoặc xem toàn bộ sản phẩm."><Link className="button button-primary" to="/products?status=ALL">Xem tất cả sản phẩm</Link></EmptyState>}
    </section>
  </div>;
}
