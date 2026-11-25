import type { Product } from '../../types/product';
import { soldPercent } from '../../utils/product';
export function StockIndicator({ product }: { product: Product }) {
  const percent = soldPercent(product);
  const known = product.initialStock > 0 && product.stock <= product.initialStock;
  return <div className="stock-indicator"><div className="stock-label"><span>{known ? `Đã bán ${product.initialStock - product.stock}` : 'Chưa có số liệu bán'}</span><span className={product.stock <= 3 ? 'low-stock' : ''}>{product.stock ? `Còn ${product.stock} chiếc` : 'Đã hết hàng'}</span></div>{known && <div className="stock-track" role="progressbar" aria-label="Tỷ lệ đã bán" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>}</div>;
}
