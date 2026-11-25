import { SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useCampaigns } from '../hooks/useCampaigns';
import { filterProducts } from '../utils/product';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { ProductGrid } from '../components/product/ProductGrid';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import type { CampaignStatus } from '../types/campaign';

const campaignStatuses: { value: CampaignStatus | 'ALL'; label: string }[] = [
  { value: 'ACTIVE', label: 'Đang diễn ra' },
  { value: 'UPCOMING', label: 'Sắp diễn ra' },
  { value: 'ENDED', label: 'Đã kết thúc' },
  { value: 'ALL', label: 'Tất cả chiến dịch' },
];

export function ProductListingPage() {
  const { products, loading, error, retry } = useProducts();
  const { campaigns, loading: campaignsLoading, error: campaignsError, retry: retryCampaigns } = useCampaigns();
  const categories = [...new Set(products.map(product => product.category))];
  const saleEndsAt = products.map(product => product.saleEndsAt).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '', category = params.get('category') || '', sort = params.get('sort') || 'discount';
  const min = params.get('min') || '', max = params.get('max') || '';
  const requestedStatus = params.get('status');
  const status = campaignStatuses.some(item => item.value === requestedStatus)
    ? requestedStatus as CampaignStatus | 'ALL' : 'ACTIVE';
  const selectedCampaignId = params.get('campaignId') || '';
  const update = (key: string, value: string) => { setParams(previous => { const next = new URLSearchParams(previous); value ? next.set(key, value) : next.delete(key); return next; }, { replace: true }); };
  const chooseStatus = (value: CampaignStatus | 'ALL') => setParams(previous => {
    const next = new URLSearchParams(previous);
    value === 'ACTIVE' ? next.delete('status') : next.set('status', value);
    next.delete('campaignId');
    return next;
  }, { replace: true });
  const availableCampaigns = status === 'ALL' ? campaigns : campaigns.filter(campaign => campaign.status === status);
  const selectedCampaign = availableCampaigns.find(campaign => campaign.campaignId === selectedCampaignId);
  const campaignIds = selectedCampaign ? new Set(selectedCampaign.productIds) :
    status === 'ALL' ? undefined : new Set(availableCampaigns.flatMap(campaign => campaign.productIds));
  const campaignProducts = campaignIds ? products.filter(product => campaignIds.has(product.productId)) : products;
  const filtered = filterProducts(campaignProducts, { query, category, sort, minPrice: Math.max(0, Number(min) || 0), maxPrice: max ? Math.max(0, Number(max) || 0) : Infinity });
  const hasFilters = Boolean(query || category || min || max || selectedCampaignId || status !== 'ACTIVE');
  const clearFilters = () => setParams(status === 'ACTIVE' ? { status } : {});
  return <><div className="listing-title-bar"><div className="container listing-title"><div><h1>Tất cả sản phẩm Flash Sale</h1><span aria-live="polite">{loading ? 'Đang tải' : `${filtered.length} sản phẩm`}</span></div>{saleEndsAt && <CountdownTimer target={saleEndsAt} label="PHIÊN KẾT THÚC TRONG" />}</div></div><div className="container listing-page"><section className="filter-panel" aria-label="Bộ lọc sản phẩm"><div className="campaign-filter"><span>Chiến dịch:</span><div className="filter-chips" role="group" aria-label="Trạng thái chiến dịch">{campaignStatuses.map(item => <button key={item.value} className={`chip ${status === item.value ? 'selected' : ''}`} onClick={() => chooseStatus(item.value)} aria-pressed={status === item.value}>{item.label}</button>)}</div></div>{availableCampaigns.length > 0 && <div className="filter-chips campaign-options" role="group" aria-label="Chiến dịch">{availableCampaigns.map(campaign => <button key={campaign.campaignId} className={`chip ${selectedCampaignId === campaign.campaignId ? 'selected' : ''}`} onClick={() => update('campaignId', selectedCampaignId === campaign.campaignId ? '' : campaign.campaignId)} aria-pressed={selectedCampaignId === campaign.campaignId}>{campaign.name}</button>)}</div>}<div className="filter-top"><div className="filter-chips" role="group" aria-label="Danh mục">{['', ...categories].map(item => <button key={item} className={`chip ${category === item ? 'selected' : ''}`} onClick={() => update('category', item)} aria-pressed={category === item}>{item || 'Tất cả danh mục'}</button>)}</div><label className="sort-label">Sắp xếp:<select aria-label="Sắp xếp sản phẩm" value={sort} onChange={event => update('sort', event.target.value)}><option value="discount">Giảm nhiều nhất</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option><option value="popular">Đang bán chạy</option></select></label></div><div className="price-filters"><span><SlidersHorizontal size={15} /> Khoảng giá</span><label><span className="sr-only">Giá từ</span><input type="number" min="0" step="10000" placeholder="Từ (₫)" value={min} onChange={event => update('min', event.target.value)} /></label><span>—</span><label><span className="sr-only">Giá đến</span><input type="number" min="0" step="10000" placeholder="Đến (₫)" value={max} onChange={event => update('max', event.target.value)} /></label>{query && <span className="query-label">Tìm: “{query}”</span>}{hasFilters && <button className="clear-filters" onClick={clearFilters}><X size={14} /> Xóa bộ lọc</button>}</div></section>{campaignsError && <p className="filter-warning" role="alert">{campaignsError} <button onClick={retryCampaigns}>Thử lại</button></p>}{campaignsLoading || loading ? <LoadingSkeleton count={8} /> : error ? <EmptyState error title="Không thể tải sản phẩm" description={error}><Button onClick={retry}>Thử lại</Button></EmptyState> : filtered.length ? <ProductGrid products={filtered} campaigns={campaigns} /> : <EmptyState title="Chưa tìm thấy sản phẩm trong chiến dịch" description="Chọn trạng thái hoặc chiến dịch khác để xem sản phẩm."><Button onClick={clearFilters}>Xóa bộ lọc</Button></EmptyState>}{min && max && Number(min) > Number(max) && <p className="filter-warning" role="status">Giá bắt đầu cần nhỏ hơn hoặc bằng giá kết thúc.</p>}</div></>;
}
