import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { OrderItems } from '../components/order/OrderSummary';
import { readCart, totalQuantity } from '../services/cartStorage';
import { loadCheckoutCatalog, pricedItems, quoteSelections, type CheckoutCatalog } from '../services/checkoutCatalog';
import { OrderApiError } from '../services/httpOrderService';
import { orderService } from '../services/orderService';
import { clearIntent, getIntent, rememberCartCheckout, saveAccess, saveHistory, saveIntent, settleCartCheckout } from '../services/orderStorage';
import { isMoney, isTerminal } from '../types/order';
import { useCart } from '../contexts/CartContext';
import { formatPrice } from '../utils/product';

export function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cart = useCart();
  const [intent, setIntent] = useState(getIntent);
  const [catalog, setCatalog] = useState<{ ids: string; value?: CheckoutCatalog; failed?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [priceNotice, setPriceNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(false);
  const fromCart = params.get('source') === 'cart';
  const back = fromCart ? '/cart' : '/products';
  const productId = params.get('productId') || '';
  const selections = fromCart ? cart.items : productId ? [{
    productId, quantity: Number(params.get('quantity')), selectedColor: params.get('color') || undefined,
  }] : [];
  const productIds = JSON.stringify(selections.map(item => item.productId));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const ids: string[] = JSON.parse(productIds);
    if (intent || !ids.length) return;
    let active = true;
    setCatalog(undefined);
    void loadCheckoutCatalog(ids).then(
      value => { if (active) setCatalog({ ids: productIds, value }); },
      () => { if (active) setCatalog({ ids: productIds, failed: true }); },
    );
    return () => { active = false; };
  }, [productIds, intent, attempt]);

  const currentCatalog = catalog?.ids === productIds ? catalog : undefined;
  const quote = currentCatalog?.value ? quoteSelections(selections, currentCatalog.value) : [];
  const items = intent?.items ?? quote.map(line => line.item);
  const subtotal = items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0);
  const valid = quote.length > 0 && quote.every(line => !line.issue && isMoney(line.item.subtotal)) && isMoney(subtotal);

  async function submit() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    let current = getIntent();
    let sending = false;
    try {
      if (!current) {
        if (!valid) return;
        const fresh = await loadCheckoutCatalog(JSON.parse(productIds));
        if (!mounted.current) return;
        setCatalog({ ids: productIds, value: fresh });
        if (fromCart && JSON.stringify(readCart()) !== JSON.stringify(cart.items)) {
          setError('Giỏ hàng vừa thay đổi. Hãy kiểm tra lại sản phẩm và số lượng.');
          return;
        }
        const latest = quoteSelections(selections, fresh);
        if (latest.some(line => line.issue)) {
          setError('Tình trạng sản phẩm đã thay đổi. Hãy kiểm tra lựa chọn trước khi đặt hàng.');
          return;
        }
        if (latest.some((line, index) => line.item.unitPrice !== quote[index]?.item.unitPrice)) {
          setPriceNotice('Giá vừa thay đổi. Hãy kiểm tra tổng tiền mới trước khi đặt hàng.');
          return;
        }
        current = {
          key: crypto.randomUUID(), items: pricedItems(latest), createdAt: Date.now(),
          source: fromCart ? 'cart' : 'buy-now',
          cartAdditionIds: fromCart ? cart.items.flatMap(item => item.additions.map(addition => addition.id)) : undefined,
        };
        saveIntent(current);
        setIntent(current);
      }
      sending = true;
      const order = await orderService.submit(current);
      rememberCartCheckout(order.orderId, current);
      saveAccess(order.orderId, current.key);
      saveHistory(order);
      settleCartCheckout(order);
      clearIntent(current.key);
      if (mounted.current) {
        setIntent(null);
        navigate(`/orders/${encodeURIComponent(order.orderId)}/${isTerminal(order.status) ? 'result' : 'processing'}`);
      }
    } catch (failure) {
      if (failure instanceof OrderApiError && failure.definitelyRejected && current) {
        try {
          clearIntent(current.key);
          if (mounted.current) {
            setIntent(null);
            setError(failure.message);
            setAttempt(value => value + 1);
          }
        } catch {
          if (mounted.current) setError('Không thể cập nhật yêu cầu đã lưu trên trình duyệt.');
        }
      } else if (mounted.current) {
        setError(sending ? 'Chưa thể xác nhận đã nhận đơn của bạn. Hãy bấm Thử lại để tiếp tục đơn này.' :
          'Chưa thể đặt hàng lúc này. Vui lòng thử lại.');
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!intent && (!selections.length || (fromCart && cart.storageError))) return <div className="container page-state">
    <EmptyState title={cart.storageError ? 'Không thể mở giỏ hàng' : 'Chưa chọn sản phẩm'} description={cart.storageError || 'Hãy chọn sản phẩm để đặt hàng.'}>
      <Link className="button button-primary" to={back}>{fromCart ? 'Về giỏ hàng' : 'Xem sản phẩm'}</Link>
    </EmptyState>
  </div>;
  if (!intent && !currentCatalog) return <div className="container page-state" role="status">Đang kiểm tra giá và tồn kho...</div>;
  if (!intent && currentCatalog?.failed) return <div className="container page-state">
    <EmptyState error title="Không thể kiểm tra sản phẩm" description="Vui lòng tải lại thông tin trước khi đặt hàng.">
      <Button onClick={() => setAttempt(value => value + 1)}>Thử lại</Button>
    </EmptyState>
  </div>;

  return <div className="container order-checkout">
    <h1>Xác nhận đơn hàng</h1>
    <div className="checkout-grid">
      <section className="order-panel">
        <h2>Sản phẩm đặt mua</h2>
        <OrderItems items={items} />
        {!intent && quote.map((line, index) => <div key={line.item.productId}>
          {line.priceChanged && <p className="order-notice" role="status">
            {line.item.name} đã đổi giá từ {formatPrice(cart.items[index].unitPrice)} sang {formatPrice(line.item.unitPrice!)}.
          </p>}
          {line.issue && <p className="order-error" role="alert">{line.item.name} · {line.issue}</p>}
        </div>)}
      </section>
      <section className="order-panel checkout-total checkout-review">
        <h2>Tóm tắt đơn hàng</h2>
        <div className="order-summary-head"><span>Số lượng</span><strong>{totalQuantity(items)}</strong></div>
        <div className="order-summary-head">
          <span>Tổng dự kiến</span><strong className="order-price">{isMoney(subtotal) ? formatPrice(subtotal) : '—'}</strong>
        </div>
        {intent && !busy && !error && <p className="order-notice" role="status">Đơn này đang chờ gửi lại.</p>}
        {priceNotice && !intent && <p className="order-notice" role="status">{priceNotice}</p>}
        {error && <p className="order-error" role="alert">{error}</p>}
        <Button className="order-full-button" disabled={busy || (!intent && !valid)} onClick={() => void submit()}>
          {busy ? 'Đang đặt hàng…' : intent ? 'Thử lại' : 'Đặt hàng'}
        </Button>
        {!intent && <Link className="text-link" to={back}>{fromCart ? 'Về giỏ hàng' : 'Xem sản phẩm'}</Link>}
      </section>
    </div>
  </div>;
}
