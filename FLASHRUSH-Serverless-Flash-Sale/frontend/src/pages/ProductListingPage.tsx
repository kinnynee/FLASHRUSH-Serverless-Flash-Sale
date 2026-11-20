import { ArrowRight, BadgeCheck, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { filterProducts } from '../utils/product';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { ProductGrid } from '../components/product/ProductGrid';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';

export function ProductListingPage() {
  const { products, loading, error, retry } = useProducts();
  const categories = [...new Set(products.map(product => product.category))];
  const saleEndsAt = products.map(product => product.saleEndsAt).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '', category = params.get('category') || '', sort = params.get('sort') || 'discount';
  const min = params.get('min') || '', max = params.get('max') || '';
  const update = (key: string, value: string) => { setParams(previous => { const next = new URLSearchParams(previous); value ? next.set(key, value) : next.delete(key); return next; }, { replace: true }); };
  const filtered = filterProducts(products, { query, category, sort, minPrice: Math.max(0, Number(min) || 0), maxPrice: max ? Math.max(0, Number(max) || 0) : Infinity });
  const hasFilters = Boolean(query || category || min || max);
  return <><div className="listing-title-bar"><div className="container listing-title"><div><h1>Tất cả sản phẩm Flash Sale</h1><span aria-live="polite">{loading ? 'Đang tải' : `${filtered.length} sản phẩm`} • Dữ liệu mô phỏng</span></div>{saleEndsAt && <CountdownTimer target={saleEndsAt} label="PHIÊN KẾT THÚC TRONG" />}</div></div><div className="container listing-page"><section className="filter-panel" aria-label="Bộ lọc sản phẩm"><div className="filter-top"><div className="filter-chips" role="group" aria-label="Danh mục">{['', ...categories].map(item => <button key={item} className={`chip ${category === item ? 'selected' : ''}`} onClick={() => update('category', item)} aria-pressed={category === item}>{item || 'Tất cả'}</button>)}</div><label className="sort-label">Sắp xếp:<select aria-label="Sắp xếp sản phẩm" value={sort} onChange={event => update('sort', event.target.value)}><option value="discount">Giảm nhiều nhất</option><option value="price-asc">Giá tăng dần</option><option value="price-desc">Giá giảm dần</option><option value="popular">Đang bán chạy</option></select></label></div><div className="price-filters"><span><SlidersHorizontal size={15} /> Khoảng giá</span><label><span className="sr-only">Giá từ</span><input type="number" min="0" step="10000" placeholder="Từ (₫)" value={min} onChange={event => update('min', event.target.value)} /></label><span>—</span><label><span className="sr-only">Giá đến</span><input type="number" min="0" step="10000" placeholder="Đến (₫)" value={max} onChange={event => update('max', event.target.value)} /></label>{query && <span className="query-label">Tìm: “{query}”</span>}{hasFilters && <button className="clear-filters" onClick={() => setParams({})}><X size={14} /> Xóa bộ lọc</button>}</div></section>{min && max && Number(min) > Number(max) && <p className="filter-warning" role="status">Giá bắt đầu cần nhỏ hơn hoặc bằng giá kết thúc.</p>}{loading ? <LoadingSkeleton count={8} /> : error ? <EmptyState error title="Không thể tải sản phẩm" description={error}><Button onClick={retry}>Thử lại</Button></EmptyState> : filtered.length ? <ProductGrid products={filtered} /> : <EmptyState title="Chưa tìm thấy sản phẩm" description="Thử từ khóa khác hoặc mở rộng khoảng giá để tìm ưu đãi phù hợp."><Button onClick={() => setParams({})}>Xóa bộ lọc</Button></EmptyState>}<div className="demo-notice"><BadgeCheck size={20} /><span>Dữ liệu mô phỏng Flash Sale trên AWS • Không thanh toán hoặc giao hàng thực tế</span><span className="notice-count">{filtered.length} sản phẩm <ArrowRight size={15} /></span></div></div></>;
}
