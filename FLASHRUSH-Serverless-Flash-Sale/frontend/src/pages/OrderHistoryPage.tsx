import { useEffect, useState } from 'react';
import { orderService } from '../services/orderService';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { Button } from '../components/common/Button';
import type { OrderRecord } from '../types/order';
import { Link } from 'react-router-dom';
import { OrderStatusBadge } from '../components/order/OrderStatusBadge';
import { OrderSummary } from '../components/order/OrderSummary';
import { getAccess, getHistory, getIntent } from '../services/orderStorage';
import type { OrderStatus } from '../types/order';
const filters: { label: string; value: OrderStatus | 'ALL' }[] = [{ label: 'Tất cả', value: 'ALL' }, { label: 'Đang chờ', value: 'PENDING' }, { label: 'Đã xác nhận', value: 'CONFIRMED' }, { label: 'Hết hàng', value: 'OUT_OF_STOCK' }, { label: 'Thất bại', value: 'FAILED' }];
export function OrderHistoryPage() {
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL'); const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const access = getAccess(); const pendingIntent = getIntent();
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    async function load() {
      try {
        const local = getHistory(), keys = getAccess();
        const results = await Promise.allSettled(local.map(order => keys[order.orderId] ? orderService.getOrder(order.orderId, keys[order.orderId]) : Promise.resolve(order)));
        if (!active) return;
        setOrders(results.map((result, index) => result.status === 'fulfilled' ? result.value : local[index]));
        if (results.some(result => result.status === 'rejected')) setError('Chưa cập nhật được một số đơn. Vui lòng thử lại; thông tin đã lưu vẫn được giữ nguyên.');
      } catch { if (active) setError('Không thể đọc lịch sử trên trình duyệt.'); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [attempt]);
  if (loading) return <div className="container page-state"><LoadingSkeleton count={2} /></div>;
  if (error) return <div className="container order-panel" role="alert"><p>{error}</p><Button onClick={() => setAttempt(value => value + 1)}>Thử lại</Button></div>;
  const shown = orders.filter(o => (filter === 'ALL' || (o.status === filter || (filter === 'PENDING' && o.status === 'PROCESSING'))) && `${o.orderId} ${o.item.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="container order-history"><section className="order-panel history-title"><span className="demo-badge">Lịch sử mô phỏng trên trình duyệt này</span><h1>Đơn hàng của tôi</h1><p>Theo dõi các yêu cầu đặt hàng trong bản demo.</p><p>{orders.length} yêu cầu · {orders.filter(o => o.status === 'CONFIRMED').length} xác nhận gần nhất</p></section>{pendingIntent && <div className="order-notice">Có yêu cầu chưa xác định kết quả. <Link className="text-link" to="/checkout">Tiếp tục yêu cầu đã lưu</Link></div>}<div className="order-panel history-filters"><div>{filters.map(f => <button key={f.value} className={filter === f.value ? 'selected' : ''} onClick={() => setFilter(f.value)}>{f.label} ({f.value === 'ALL' ? orders.length : orders.filter(o => (o.status === f.value || (f.value === 'PENDING' && o.status === 'PROCESSING'))).length})</button>)}</div><input aria-label="Tìm theo mã đơn hoặc tên sản phẩm" placeholder="Tìm theo mã đơn hoặc tên sản phẩm..." value={query} onChange={e => setQuery(e.target.value)} /></div>{shown.length === 0 && <section className="order-panel">Chưa có đơn hàng phù hợp.</section>}{shown.map(order => <section className="order-panel history-card" key={order.orderId}><div className="history-card-head"><strong>{order.orderId}</strong><time>{new Date(order.createdAt).toLocaleString('vi-VN')}</time>{access[order.orderId] ? <OrderStatusBadge status={order.status} /> : <span className="order-badge">Không thể xác minh</span>}</div><OrderSummary item={order.item} /><div className="history-card-footer"><span>{access[order.orderId] ? 'Trạng thái đã lưu gần nhất · Dữ liệu mô phỏng' : 'Phiên truy cập đã hết; không thể kiểm tra trạng thái hiện tại.'}</span><Link className="button order-outline" to={`/orders/${encodeURIComponent(order.orderId)}/${access[order.orderId] && order.status !== 'PENDING' ? 'result' : 'processing'}`}>Xem chi tiết</Link></div></section>)}</div>;
}
