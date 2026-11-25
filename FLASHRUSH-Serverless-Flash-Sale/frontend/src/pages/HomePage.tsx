import { useState } from 'react';
import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useStorefrontCampaigns } from '../hooks/useStorefrontCampaigns';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { ProductGrid } from '../components/product/ProductGrid';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { catalogCategories, saleDeadline } from '../utils/storefront';

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
  const deadline = saleDeadline(visibleCampaigns, now);
  const busy = loading || campaignsLoading;
  const failure = error || campaignsError;
  const listingLink = '/products?status=ALL' + (selected ? '&campaignId=' + encodeURIComponent(selected.campaignId) : '');
  return <div className="container home-page">
    <section className="promo-banner" aria-label="Khuyến mãi công nghệ FLASHRUSH">
      <h1 className="sr-only">FLASHRUSH — Khuyến mãi công nghệ</h1>
      <Link className="promo-banner-link" to="/products?status=ALL" aria-label="Mua ngay — Xem sản phẩm Flash Sale">
        <img src="/images/flashrush-promo-banner.png" width={1536} height={768} fetchPriority="high"
          alt="FLASHRUSH: nhập mã HAUMON, giảm 36,36%, áp dụng cho đơn hàng từ 3,6 triệu đồng trở lên. Mua ngay." />
      </Link>
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
