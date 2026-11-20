import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { OrderSummary } from '../components/order/OrderSummary';
import { productService } from '../services/productService';
import { orderService, isMockMode } from '../services/orderService';
import { clearIntent, getIntent, saveAccess, saveHistory, saveIntent } from '../services/orderStorage';
import type { Product } from '../types/product';
import type { MockOutcome, PurchaseIntent } from '../types/order';
import { formatPrice } from '../utils/product';

export function CheckoutPage() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const [product, setProduct] = useState<Product>(); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [intent, setIntent] = useState<PurchaseIntent | null>(() => getIntent());
  const [outcome, setOutcome] = useState<MockOutcome>('CONFIRMED');
  const productId = params.get('productId') || ''; const quantity = Number(params.get('quantity')); const color = params.get('color') || undefined;
  useEffect(() => { let active = true; setLoading(true); setError(''); productService.getProductById(productId).then(p => { if (active) setProduct(p); }).catch(() => { if (active) setError('Không thể tải sản phẩm.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [productId]);
  const valid = !!product && Number.isInteger(quantity) && quantity > 0 && quantity <= product.stock && Date.parse(product.saleEndsAt) > Date.now() && (!color || !!product.colors?.includes(color));
  async function submit() {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      let current = getIntent();
      if (!current) {
        if (!product || !valid || Date.parse(product.saleEndsAt) <= Date.now()) throw new Error('Lựa chọn sản phẩm không hợp lệ hoặc phiên sale đã kết thúc.');
        current = { key: crypto.randomUUID(), item: { productId: product.productId, name: product.name, image: product.images[0], quantity, unitPrice: product.price, selectedColor: color }, outcome, createdAt: Date.now() };
        saveIntent(current); setIntent(current);
      }
      const order = await orderService.submit(current);
      saveAccess(order.orderId, current.key); saveHistory(order); clearIntent(); setIntent(null);
      navigate(`/orders/${encodeURIComponent(order.orderId)}/${order.status === 'PENDING' ? 'processing' : 'result'}`);
    } catch { setError('Chưa xác định được kết quả gửi yêu cầu. Hãy thử lại cùng yêu cầu đã lưu; không tạo yêu cầu mới.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (loading && !intent) return <div className="container page-state">Đang tải sản phẩm...</div>;
  if (!intent && !valid) return <div className="container"><EmptyState error title="Không thể xác nhận lựa chọn" description={error || 'Sản phẩm, số lượng hoặc phiên sale không hợp lệ.'}><Link className="button button-primary" to="/products">Xem sản phẩm</Link></EmptyState></div>;
  const item = intent?.item || { productId: product!.productId, name: product!.name, image: product!.images[0], quantity, unitPrice: product!.price, selectedColor: color };
  return <div className="container order-checkout"><div className="order-kicker">● QUY TRÌNH ĐẶT HÀNG BẤT ĐỒNG BỘ</div><h1>Xác nhận yêu cầu đặt hàng</h1><p>Kiểm tra thông tin trước khi gửi yêu cầu đặt hàng.</p><div className="checkout-grid"><div><section className="order-panel"><h2>Luồng xử lý Serverless</h2><p>Quy trình tiếp nhận và xử lý đơn hàng qua SQS & Lambda.</p><div className="order-steps">{['Gửi yêu cầu', 'HTTP 202 Accepted', 'SQS & Lambda Worker', 'DynamoDB · Chốt tồn kho'].map((step, index) => <div key={step}><b>BƯỚC {index + 1}</b><strong>{step}</strong></div>)}</div></section><section className="order-panel"><h2>Thông tin yêu cầu đặt hàng</h2><OrderSummary item={item} /></section></div><section className="order-panel checkout-total"><h2>Tóm tắt đơn hàng</h2><div className="order-summary-head"><span>Đơn giá Flash Sale</span><span>{formatPrice(item.unitPrice)}</span></div><div className="order-summary-head"><span>Số lượng đặt</span><span>{item.quantity} sản phẩm</span></div><div className="order-summary-head"><span>Phí vận chuyển</span><span>Miễn phí</span></div><div className="order-summary-head"><strong>Tổng thanh toán</strong><strong className="order-price">{formatPrice(item.unitPrice * item.quantity)}</strong></div><p className="order-notice">Đơn hàng sẽ được tiếp nhận và xử lý theo thứ tự qua hàng đợi SQS.</p>{intent && <p className="order-notice" role="status">Có yêu cầu chưa xác định kết quả từ phiên trước. Tiếp tục sẽ gửi lại đúng yêu cầu đã lưu.</p>}{error && <p className="order-error" role="alert">{error}</p>}<Button className="order-full-button" disabled={busy} onClick={submit}>{busy ? 'Đang gửi...' : intent ? 'Thử lại yêu cầu đã lưu' : 'GỬI YÊU CẦU ĐẶT HÀNG'}</Button></section></div></div>;
}
