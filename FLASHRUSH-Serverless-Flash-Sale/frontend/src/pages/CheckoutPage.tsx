import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { OrderSummary } from '../components/order/OrderSummary';
import { productService } from '../services/productService';
import { orderService } from '../services/orderService';
import { useCampaigns } from '../hooks/useCampaigns';
import { clearIntent, getIntent, saveAccess, saveHistory, saveIntent } from '../services/orderStorage';
import type { Product } from '../types/product';
import type { MockOutcome, PurchaseIntent } from '../types/order';
import { formatPrice } from '../utils/product';
import { useCountdown } from '../hooks/useCountdown';
import { getServerNow } from '../utils/serverClock';

export function CheckoutPage() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const { campaigns, loading: campaignsLoading, error: campaignsError } = useCampaigns();
  const [product, setProduct] = useState<Product>(); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [intent, setIntent] = useState<PurchaseIntent | null>(() => getIntent());
  const [outcome] = useState<MockOutcome>('CONFIRMED');
  const productId = params.get('productId') || ''; const quantity = Number(params.get('quantity')); const color = params.get('color') || undefined;
  useEffect(() => { let active = true; setLoading(true); setError(''); productService.getProductById(productId).then(p => { if (active) setProduct(p); }).catch(() => { if (active) setError('Không thể tải sản phẩm.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [productId]);
  const serverNow = getServerNow();
  const matchingCampaigns = product ? campaigns.filter(campaign => campaign.productIds.includes(product.productId)) : [];
  const activeCampaigns = matchingCampaigns.filter(campaign => serverNow >= Date.parse(campaign.saleStartsAt || campaign.startTime) &&
    serverNow <= Date.parse(campaign.saleEndsAt || campaign.endTime));
  const campaignLimit = activeCampaigns.reduce<number | undefined>((limit, campaign) =>
    limit === undefined ? campaign.maxQtyPerOrder : Math.min(limit, campaign.maxQtyPerOrder), undefined);
  const campaignStartsAt = matchingCampaigns.map(campaign => campaign.saleStartsAt || campaign.startTime).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const campaignEndsAt = activeCampaigns.map(campaign => campaign.saleEndsAt || campaign.endTime).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const saleStartsAt = product?.saleStartsAt || campaignStartsAt || '';
  const saleEndsAt = product?.saleEndsAt || campaignEndsAt || '';
  const secondsToStart = useCountdown(saleStartsAt);
  const secondsToEnd = useCountdown(saleEndsAt);
  const saleUpcoming = !!saleStartsAt && secondsToStart > 0;
  const choiceValid = !!product && Number.isInteger(quantity) && quantity > 0 && quantity <= product.stock &&
    (campaignsLoading || (campaignLimit !== undefined && quantity <= campaignLimit)) &&
    (!color || !!product.colors?.includes(color));
  const valid = choiceValid && secondsToEnd > 0 && !saleUpcoming;
  async function submit() {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      let current = getIntent();
      if (!current) {
        if (!product || !valid) throw new Error(campaignsError || 'Lựa chọn sản phẩm không hợp lệ hoặc đợt Flash Sale đã kết thúc.');
        current = { key: crypto.randomUUID(), item: { productId: product.productId, name: product.name, image: product.images[0], quantity, unitPrice: product.price, selectedColor: color }, outcome, createdAt: Date.now() };
        saveIntent(current); setIntent(current);
      }
      const order = await orderService.submit(current);
      saveAccess(order.orderId, current.key); saveHistory(order); clearIntent(); setIntent(null);
      navigate(`/orders/${encodeURIComponent(order.orderId)}/${order.status === 'PENDING' ? 'processing' : 'result'}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '';
      setError(message === 'SALE_NOT_ACTIVE' ? 'Flash Sale chưa mở. Vui lòng chờ đến giờ bắt đầu.' :
        message === 'SALE_ENDED' ? 'Flash Sale đã kết thúc.' : message === 'SALE_SOLD_OUT' ? 'Sản phẩm đã hết hàng.' :
        'Chưa xác định được kết quả gửi yêu cầu. Hãy thử lại cùng yêu cầu đã lưu; không tạo yêu cầu mới.');
    }
    finally { lock.current = false; setBusy(false); }
  }
  if ((loading || campaignsLoading) && !intent) return <div className="container page-state">Đang tải sản phẩm và đợt Flash Sale...</div>;
  if (!intent && !choiceValid) return <div className="container"><EmptyState error title="Không thể xác nhận lựa chọn" description={error || campaignsError.replace(/chiến dịch/gi, 'đợt Flash Sale') || 'Sản phẩm, số lượng hoặc đợt Flash Sale không hợp lệ.'}><Link className="button button-primary" to="/products">Xem sản phẩm</Link></EmptyState></div>;
  const item = intent?.item || { productId: product!.productId, name: product!.name, image: product!.images[0], quantity, unitPrice: product!.price, selectedColor: color };
  return <div className="container order-checkout"><div className="order-kicker">FLASHRUSH / ĐẶT HÀNG</div><h1>Xác nhận yêu cầu đặt hàng</h1><p>Kiểm tra thông tin trước khi gửi yêu cầu đặt hàng.</p><div className="checkout-grid"><div><section className="order-panel"><h2>Mua sắm trong vài bước</h2><p>Kiểm tra lựa chọn và theo dõi kết quả xác nhận đơn hàng.</p><div className="order-steps">{['Chọn sản phẩm', 'Xác nhận yêu cầu', 'Kiểm tra tồn kho', 'Nhận kết quả'].map((step, index) => <div key={step}><b>BƯỚC {index + 1}</b><strong>{step}</strong></div>)}</div></section><section className="order-panel"><h2>Thông tin yêu cầu đặt hàng</h2><OrderSummary item={item} /></section></div><section className="order-panel checkout-total"><h2>Tóm tắt đơn hàng</h2><div className="order-summary-head"><span>Đơn giá Flash Sale</span><span>{formatPrice(item.unitPrice)}</span></div><div className="order-summary-head"><span>Số lượng đặt</span><span>{item.quantity} sản phẩm</span></div><div className="order-summary-head"><span>Phí vận chuyển</span><span>Miễn phí</span></div><div className="order-summary-head"><strong>Tổng thanh toán</strong><strong className="order-price">{formatPrice(item.unitPrice * item.quantity)}</strong></div><p className="order-notice">Tồn kho được kiểm tra khi xử lý yêu cầu. Bạn có thể theo dõi kết quả trong Đơn hàng của tôi.</p>{intent && <p className="order-notice" role="status">Có yêu cầu chưa xác định kết quả từ phiên trước. Tiếp tục sẽ gửi lại đúng yêu cầu đã lưu.</p>}{error && <p className="order-error" role="alert">{error}</p>}<Button className="order-full-button" disabled={busy || (!intent && !valid)} onClick={submit}>{busy ? 'Đang gửi...' : intent ? 'Thử lại yêu cầu đã lưu' : !product?.stock ? 'HẾT HÀNG' : saleUpcoming ? 'SẮP MỞ BÁN' : secondsToEnd <= 0 ? 'ĐÃ KẾT THÚC' : 'GỬI YÊU CẦU ĐẶT HÀNG'}</Button></section></div></div>;
}
