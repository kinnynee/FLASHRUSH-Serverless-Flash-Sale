import { ArrowRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { CountdownTimer } from '../components/common/CountdownTimer';
import { ProductGrid } from '../components/product/ProductGrid';
import { ProductImage } from '../components/common/ProductImage';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';

export function HomePage() {
  const { products, loading, error, retry } = useProducts();
  const categories = [...new Set(products.map(product => product.category))];
  const saleEndsAt = products.map(product => product.saleEndsAt).filter(value => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return <div className="container home-page"><section className="hero"><div className="hero-copy"><span className="eyebrow"><Zap size={14} fill="currentColor" /> PHIÊN ĐỘC QUYỀN</span><h1>FLASH SALE HÔM NAY</h1><p>Giá tốt mỗi ngày • Số lượng có hạn</p>{saleEndsAt && <CountdownTimer target={saleEndsAt} />}<Link className="button button-primary hero-cta" to="/products">Xem tất cả ưu đãi <ArrowRight size={17} /></Link><small>Khám phá công nghệ. Chớp lấy ưu đãi.</small></div><Link className="hero-image" to="/products/sony-wh-1000xm5" aria-label="Khám phá tai nghe Sony"><span className="hero-discount"><Zap size={14} /> Giảm đến 49%</span><ProductImage src="/images/headphones-black.jpg" alt="Tai nghe màu đen" fetchPriority="high" /></Link></section><section className="sale-sessions" aria-label="Lịch phiên Flash Sale"><div className="session active"><strong>Đang diễn ra</strong><small><span className="live-dot" /> Đang diễn ra</small></div>{['12:00', '18:00', '21:00'].map(time => <div className="session" key={time}><strong>{time}</strong><small>Sắp diễn ra</small></div>)}</section><section aria-labelledby="featured-title"><div className="section-heading"><div><span className="section-kicker"><Zap size={14} /> ƯU ĐÃI NỔI BẬT</span><h2 id="featured-title">Săn nhanh, giá hời</h2></div><Link className="text-link" to="/products">Xem tất cả <ArrowRight size={16} /></Link></div><nav className="category-links" aria-label="Danh mục sản phẩm">{categories.map(category => <Link to={`/products?category=${encodeURIComponent(category)}`} key={category}>{category}</Link>)}</nav>{loading ? <LoadingSkeleton /> : error ? <EmptyState error title="Chưa tải được ưu đãi" description={error}><Button onClick={retry}>Thử lại</Button></EmptyState> : <ProductGrid products={products.slice(0, 4)} />}</section></div>;
}
