export function LoadingSkeleton({ count = 4 }: { count?: number }) {
  return <div className="product-grid" role="status" aria-label="Đang tải sản phẩm"><span className="sr-only">Đang tải sản phẩm…</span>{Array.from({ length: count }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton skeleton-image" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-button" /></div>)}</div>;
}
