import { useMemo, useState } from 'react';
import { ArrowRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useCampaigns } from '../hooks/useCampaigns';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProductImage } from '../components/common/ProductImage';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import type { CampaignStatus } from '../types/campaign';

const statuses: { value: CampaignStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang diễn ra' },
  { value: 'UPCOMING', label: 'Sắp diễn ra' },
  { value: 'ENDED', label: 'Đã kết thúc' },
];

export function HomePage() {
  const { products, loading, error, retry } = useProducts();
  const { campaigns, loading: campaignsLoading, error: campaignsError, retry: retryCampaigns } = useCampaigns();
  const [status, setStatus] = useState<CampaignStatus>('ACTIVE');
  const [campaignId, setCampaignId] = useState('');
  const categories = [...new Set(products.map(product => product.category))];
  const saleEndsAt = products.map(product => product.saleEndsAt).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const visibleCampaigns = campaigns.filter(campaign => campaign.status === status);
  const selectedCampaign = visibleCampaigns.find(campaign => campaign.campaignId === campaignId);
  const campaignProductIds = useMemo(() => selectedCampaign ? new Set(selectedCampaign.productIds) :
    new Set(visibleCampaigns.flatMap(campaign => campaign.productIds)), [selectedCampaign, visibleCampaigns]);
  const visibleProducts = products.filter(product => campaignProductIds.has(product.productId));
  const listingLink = `/products?status=${status}${selectedCampaign ? `&campaignId=${encodeURIComponent(selectedCampaign.campaignId)}` : ''}`;
  return <div className="container home-page"><section className="hero"><div className="hero-copy"><span className="eyebrow"><Zap size={14} fill="currentColor" /> PHIÊN ĐỘC QUYỀN</span><h1>FLASH SALE HÔM NAY</h1><p>Giá tốt mỗi ngày • Số lượng có hạn</p>{saleEndsAt && <CountdownTimer target={saleEndsAt} />}<Link className="button button-primary hero-cta" to={listingLink}>Xem ưu đãi <ArrowRight size={17} /></Link><small>Khám phá công nghệ. Chớp lấy ưu đãi.</small></div><Link className="hero-image" to="/products/sony-wh-1000xm5" aria-label="Khám phá tai nghe Sony"><span className="hero-discount"><Zap size={14} /> Giảm đến 49%</span><ProductImage src="/images/headphones-black.jpg" alt="Tai nghe màu đen" fetchPriority="high" /></Link></section><section className="sale-sessions" aria-label="Lọc chiến dịch Flash Sale">{statuses.map(item => <button key={item.value} type="button" className={`session ${status === item.value ? 'active' : ''}`} onClick={() => { setStatus(item.value); setCampaignId(''); }} aria-pressed={status === item.value}><strong>{item.label}</strong><small>{campaigns.filter(campaign => campaign.status === item.value).length} chiến dịch</small></button>)}</section>{visibleCampaigns.length > 1 && <nav className="category-links campaign-options" aria-label="Chiến dịch"><button className={`chip ${!selectedCampaign ? 'selected' : ''}`} onClick={() => setCampaignId('')}>Tất cả</button>{visibleCampaigns.map(campaign => <button key={campaign.campaignId} className={`chip ${campaignId === campaign.campaignId ? 'selected' : ''}`} onClick={() => setCampaignId(campaign.campaignId)} aria-pressed={campaignId === campaign.campaignId}>{campaign.name}</button>)}</nav>}<section aria-labelledby="featured-title"><div className="section-heading"><div><span className="section-kicker"><Zap size={14} /> {statuses.find(item => item.value === status)?.label.toLocaleUpperCase('vi-VN')}</span><h2 id="featured-title">{selectedCampaign?.name || 'Săn nhanh, giá hời'}</h2></div><Link className="text-link" to={listingLink}>Xem tất cả <ArrowRight size={16} /></Link></div><nav className="category-links" aria-label="Danh mục sản phẩm">{categories.map(category => <Link to={`/products?category=${encodeURIComponent(category)}`} key={category}>{category}</Link>)}</nav>{campaignsError && <EmptyState error title="Không thể tải chiến dịch" description={campaignsError}><Button onClick={retryCampaigns}>Thử lại</Button></EmptyState>}{loading || campaignsLoading ? <LoadingSkeleton /> : error ? <EmptyState error title="Chưa tải được ưu đãi" description={error}><Button onClick={retry}>Thử lại</Button></EmptyState> : visibleProducts.length ? <ProductGrid products={visibleProducts.slice(0, 8)} /> : <EmptyState title={`Chưa có chiến dịch ${statuses.find(item => item.value === status)?.label.toLocaleLowerCase('vi-VN')}`} description="Hãy chọn trạng thái khác hoặc quay lại sau."><Link className="button button-secondary" to="/products?status=ALL">Xem tất cả chiến dịch</Link></EmptyState>}</section></div>;
}
