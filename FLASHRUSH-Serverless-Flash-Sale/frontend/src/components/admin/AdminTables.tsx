import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardProduct } from '../../types/dashboard';
import type { OrderRecord } from '../../types/order';
import type { Product } from '../../types/product';
import { dashboardService } from '../../services/dashboardService';
import { formatPrice } from '../../utils/product';
import { EmptyState } from '../common/EmptyState';
import { ProductImage } from '../common/ProductImage';
import { OrderStatusBadge } from '../order/OrderStatusBadge';
import { formatTime } from '../dashboard/DashboardCommon';

interface ProductDraft {
  productId: string; name: string; category: string; description: string; price: string;
  originalPrice: string; stock: string; images: string; saleStartsAt: string; saleEndsAt: string;
}
const emptyDraft = (): ProductDraft => ({ productId: '', name: '', category: '', description: '', price: '',
  originalPrice: '', stock: '', images: '', saleStartsAt: '', saleEndsAt: '' });
const toLocalTime = (value?: string) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

export function ProductInventoryTable({ products, onRefresh }: { products: DashboardProduct[]; onRefresh?: () => void }) {
  const [editing, setEditing] = useState<Product | undefined>();
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  function begin(product?: DashboardProduct) {
    const full = product as Product | undefined;
    setEditing(full);
    setDraft(full ? { productId: full.productId, name: full.name, category: full.category, description: full.description || '',
      price: String(full.price), originalPrice: String(full.originalPrice), stock: '', images: (full.images || []).join(', '),
      saleStartsAt: toLocalTime(full.saleStartsAt), saleEndsAt: toLocalTime(full.saleEndsAt) } : emptyDraft());
    setMessage(''); setFailure(''); setOpen(true);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setFailure('');
    const images = draft.images.split(',').map(value => value.trim()).filter(Boolean);
    try {
      if (editing) {
        const stockDelta = draft.stock.trim() ? Number(draft.stock) : undefined;
        if (stockDelta !== undefined && (!Number.isInteger(stockDelta) || stockDelta === 0)) throw new Error('Điều chỉnh tồn kho phải là số nguyên khác 0.');
        await dashboardService.updateProduct(editing.productId, { name: draft.name.trim(), category: draft.category.trim(),
          description: draft.description, price: Number(draft.price), originalPrice: Number(draft.originalPrice), images,
          saleStartsAt: draft.saleStartsAt ? new Date(draft.saleStartsAt).toISOString() : undefined,
          saleEndsAt: new Date(draft.saleEndsAt).toISOString() }, stockDelta);
        setMessage('Đã cập nhật sản phẩm và tồn kho.');
      } else {
        const stock = Number(draft.stock);
        const input = { productId: draft.productId.trim(), name: draft.name.trim(), category: draft.category.trim(), description: draft.description,
          price: Number(draft.price), originalPrice: Number(draft.originalPrice), stock, initialStock: stock, images,
          isFlashSale: true, saleStartsAt: draft.saleStartsAt ? new Date(draft.saleStartsAt).toISOString() : undefined,
          saleEndsAt: new Date(draft.saleEndsAt).toISOString() } as Product;
        await dashboardService.createProduct(input);
        setMessage('Đã tạo sản phẩm.');
      }
      setOpen(false); onRefresh?.();
    } catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Không thể lưu sản phẩm.'); }
    finally { setBusy(false); }
  }
  return (
    <section className="dash-card dash-table-card" aria-labelledby="dash-products">
      <div className="dash-section-heading">
        <div><h2 id="dash-products">Sản phẩm Flash Sale</h2><p>Tồn kho của các mặt hàng trong đợt Flash Sale</p></div>
        <div className="dash-table-actions"><span>{products.length} mặt hàng</span>
          <button type="button" className="dash-text-link" onClick={() => { onRefresh?.(); }}>Làm mới</button>
          <button type="button" className="button button-primary" onClick={() => begin()}>Thêm sản phẩm</button></div>
      </div>
      {message && <p role="status" className="dash-success-message">{message}</p>}{failure && <p role="alert" className="campaign-error">{failure}</p>}
      {open && <form className="dash-product-form" onSubmit={submit}>
        <h3>{editing ? `Chỉnh sửa ${editing.name}` : 'Thêm sản phẩm'}</h3>
        <div className="dash-product-form-grid">
          <label>Mã sản phẩm<input required disabled={!!editing} maxLength={128} value={draft.productId} onChange={event => setDraft({ ...draft, productId: event.target.value })} /></label>
          <label>Tên<input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Danh mục<input required value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label>
          <label>Giá Flash Sale<input required type="number" min="0" step="1" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></label>
          <label>Giá gốc<input required type="number" min="0" step="1" value={draft.originalPrice} onChange={event => setDraft({ ...draft, originalPrice: event.target.value })} /></label>
          <label>{editing ? 'Điều chỉnh tồn kho (+/-)' : 'Tồn kho ban đầu'}<input type="number" step="1" required={!editing} value={draft.stock} onChange={event => setDraft({ ...draft, stock: event.target.value })} /></label>
          <label>Mở bán<input type="datetime-local" value={draft.saleStartsAt} onChange={event => setDraft({ ...draft, saleStartsAt: event.target.value })} /></label>
          <label>Kết thúc sale<input required type="datetime-local" value={draft.saleEndsAt} onChange={event => setDraft({ ...draft, saleEndsAt: event.target.value })} /></label>
          <label className="dash-product-form-wide">URL ảnh, phân cách bằng dấu phẩy<input required value={draft.images} onChange={event => setDraft({ ...draft, images: event.target.value })} /></label>
          <label className="dash-product-form-wide">Mô tả<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        </div>
        <div className="dash-product-form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu sản phẩm'}</button><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Hủy</button></div>
      </form>}
      {products.length === 0 ? (
        <EmptyState title="Chưa có sản phẩm" description="Hiện tại chưa có mặt hàng nào." />
      ) : (
        <div className="dash-scroll-table" role="region" aria-labelledby="dash-products" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Hình ảnh</th><th scope="col">Tên sản phẩm</th><th scope="col">Mã sản phẩm</th><th scope="col">Giá bán (VND)</th><th scope="col">Tồn ban đầu</th><th scope="col">Tồn hiện tại</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
            <tbody>
              {products.map(product => (
                <tr key={product.productId}>
                  <td><ProductImage className="dash-product-image" src={product.images[0]} alt="" /></td>
                  <th scope="row">{product.name}<small>{product.category}</small></th>
                  <td className="dash-code">{product.productId}</td>
                  <td className="dash-price">{formatPrice(product.price)}</td>
                  <td className="dash-stock">{product.initialStock}</td>
                  <td className="dash-stock">
                    <strong>{product.stock}</strong>
                    <progress max={product.initialStock || 1} value={product.stock} aria-label={`Tồn kho ${product.name}`} />
                  </td>
                  <td><span className={`dash-tag ${product.stock > 5 ? 'dash-green' : 'dash-amber'}`}>{product.stock > 5 ? 'Còn hàng' : product.stock > 0 ? 'Sắp hết' : 'Hết hàng'}</span></td>
                  <td><button className="dash-text-link" type="button" onClick={() => begin(product)}>Sửa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdminOrdersTable() {
  const [status, setStatus] = useState('');
  const [cursor, setCursor] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    dashboardService.getAdminOrders(status, cursor, 25).then(page => {
      if (active) { setOrders(page.items); setNextCursor(page.nextCursor); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Không thể tải đơn hàng.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, cursor, version]);
  function changeStatus(value: string) { setStatus(value); setCursor(''); setHistory([]); }
  return <section className="dash-card dash-table-card" aria-labelledby="dash-admin-orders">
    <div className="dash-section-heading"><div><h2 id="dash-admin-orders">Đơn hàng</h2><p>Dữ liệu trực tiếp từ DynamoDB</p></div>
      <div className="dash-table-actions"><label>Trạng thái<select value={status} onChange={event => changeStatus(event.target.value)}><option value="">Tất cả</option>{['PENDING','PROCESSING','CONFIRMED','OUT_OF_STOCK','FAILED'].map(value => <option key={value}>{value}</option>)}</select></label>
        <button type="button" className="dash-text-link" disabled={loading} onClick={() => setVersion(value => value + 1)}>Làm mới</button></div>
    </div>
    {error && <p className="campaign-error" role="alert">{error}</p>}{loading ? <p role="status">Đang tải đơn hàng...</p> : orders.length === 0 ? <EmptyState title="Chưa có đơn hàng" description="Không có đơn hàng phù hợp bộ lọc." /> :
      <div className="dash-scroll-table" role="region" aria-labelledby="dash-admin-orders" tabIndex={0}><table><thead><tr><th>Mã đơn</th><th>Sản phẩm</th><th>Số lượng</th><th>Tổng tiền</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>{orders.map(order => <tr key={order.orderId}><th scope="row">#{order.orderId}</th><td>{order.item.name}</td><td>{order.item.quantity}</td><td>{formatPrice(order.item.unitPrice * order.item.quantity)}</td><td><time dateTime={new Date(order.createdAt).toISOString()}>{formatTime(order.createdAt)}</time></td><td><OrderStatusBadge status={order.status} /></td></tr>)}</tbody></table></div>}
    <div className="dash-product-form-actions"><button className="button button-secondary" disabled={!history.length || loading} onClick={() => { setCursor(history[history.length - 1]); setHistory(current => current.slice(0, -1)); }}>Trang trước</button><button className="button button-secondary" disabled={!nextCursor || loading} onClick={() => { setHistory(current => [...current, cursor]); setCursor(nextCursor || ''); }}>Trang tiếp</button></div>
  </section>;
}

export function RecentOrdersTable({ orders, recent = false }: { orders: OrderRecord[]; recent?: boolean }) {
  const shown = recent ? orders.slice(0, 5) : orders;
  return (
    <section className="dash-card dash-table-card" aria-labelledby="dash-orders">
      <div className="dash-section-heading">
        <div><h2 id="dash-orders">{recent ? 'Đơn hàng gần đây' : 'Đơn hàng Flash Sale'}</h2><p>Các yêu cầu đặt hàng trong đợt Flash Sale</p></div>
        {recent && orders.length > shown.length && <Link className="dash-text-link" to="/admin/orders">Xem tất cả {orders.length} đơn</Link>}
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Chưa có đơn hàng" description="Hiện tại chưa ghi nhận yêu cầu đặt hàng nào." />
      ) : (
        <div className="dash-scroll-table" role="region" aria-labelledby="dash-orders" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Mã đơn hàng</th><th scope="col">Sản phẩm</th><th scope="col">Số lượng</th><th scope="col">Thời gian tạo</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
            <tbody>
              {shown.map(order => (
                <tr key={order.orderId}>
                  <th className="dash-code" scope="row">#{order.orderId}</th>
                  <td>{order.item.name}</td>
                  <td>{order.item.quantity} sp</td>
                  <td><time dateTime={new Date(order.createdAt).toISOString()}>{formatTime(order.createdAt)}</time></td>
                  <td><OrderStatusBadge status={order.status} /></td>
                  <td><Link className="dash-detail-link" to={`/admin/orders/${encodeURIComponent(order.orderId)}`} aria-label={`Xem chi tiết đơn ${order.orderId}`}>Xem chi tiết</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
