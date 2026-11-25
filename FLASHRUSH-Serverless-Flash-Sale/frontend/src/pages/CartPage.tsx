import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trash2, ShoppingCart, TicketPercent, MapPin, Truck, CreditCard, ArrowLeft } from 'lucide-react';
import { useCustomer } from '../components/customer/CustomerProvider';
import { CustomerGate } from './CustomerAuthPage';
import { customerService, CustomerApiError, customerMessage, type Profile, type CheckoutInput, type CheckoutOptions, type Pricing } from '../services/customerService';
import { ProductImage } from '../components/common/ProductImage';
import { EmptyState } from '../components/common/EmptyState';
import { formatPrice } from '../utils/product';
import { getServerNow } from '../utils/serverClock';

function stored<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
export function CartPage({ checkoutMode = false }: { checkoutMode?: boolean }) {
  const { user } = useCustomer();
  return <CustomerGate><CartContent key={(user?.sub || '') + checkoutMode} checkoutMode={checkoutMode} /></CustomerGate>;
}
function CartContent({ checkoutMode }: { checkoutMode: boolean }) {
  const { user, cart, loading, error, busy, refreshCart, updateCart, notify } = useCustomer();
  const [params] = useSearchParams(); const navigate = useNavigate();
  const selectionKey = 'flashrush.cart.selection.' + user!.sub;
  const voucherKey = 'flashrush.cart.voucher.' + user!.sub;
  const pendingKey = 'flashrush.checkout.pending.' + user!.sub;
  const [selected, setSelected] = useState<string[]>(() => params.get('select') ? [params.get('select')!] : stored(selectionKey, []));
  const [voucher, setVoucher] = useState<string>(() => stored(voucherKey, ''));
  const [voucherInput, setVoucherInput] = useState(voucher);
  const [profile, setProfile] = useState<Profile>(); const [addressId, setAddressId] = useState('');
  const [options, setOptions] = useState<CheckoutOptions>();
  const [shippingMethod, setShipping] = useState('STANDARD'); const [paymentMethod, setPayment] = useState('COD');
  const [failure, setFailure] = useState(''); const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(getServerNow()); const lock = useRef(false);
  const [revision, setRevision] = useState(0);
  const [quoteState, setQuoteState] = useState<{ key: string; pricing?: Pricing; error?: string }>();
  const [removeId, setRemoveId] = useState<string>(); const removeDialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<{ key: string; body: CheckoutInput } | null>(() => stored(pendingKey, null));
  useEffect(() => { sessionStorage.setItem(selectionKey, JSON.stringify(selected)); }, [selected, selectionKey]);
  useEffect(() => { sessionStorage.setItem(voucherKey, JSON.stringify(voucher)); }, [voucher, voucherKey]);
  useEffect(() => {
    if (removeId) removeDialog.current?.showModal(); else removeDialog.current?.close();
  }, [removeId]);
  useEffect(() => {
    let active = true;
    Promise.all([customerService.profile(), customerService.checkoutOptions()]).then(([account, config]) => {
      if (active) { setProfile(account); setAddressId(account.defaultAddressId); setOptions(config); setFailure(''); }
    }).catch(reason => { if (active) setFailure(reason.message); });
    const timer = setInterval(() => setNow(getServerNow()), 1000);
    const refresh = () => { if (!document.hidden) void refreshCart(); };
    const interval = setInterval(refresh, 30000); window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [refreshCart, revision]);
  const items = cart?.items || [];
  const issue = (line: typeof items[number]) => line.issue || (line.product && Date.parse(line.product.saleEndsAt) <= now ? 'SALE_ENDED' : '') || (line.priceChanged ? 'PRICE_CHANGED' : '');
  const available = items.filter(line => !issue(line));
  const chosen = items.filter(line => selected.includes(line.lineId));
  const quantity = chosen.reduce((sum, line) => sum + line.quantity, 0);
  const localSubtotal = chosen.reduce((sum, line) => sum + (line.product?.price ?? line.unitPrice) * line.quantity, 0);
  const selectionValid = chosen.length > 0 && chosen.length <= 10 && chosen.every(line => !issue(line));
  const quoteBody = { version: cart?.version ?? 0, lineIds: chosen.map(line => line.lineId), voucherCode: voucher, shippingMethod, paymentMethod };
  const quoteKey = JSON.stringify(quoteBody);
  const quote = quoteState?.key === quoteKey ? quoteState.pricing : undefined;
  const quoteError = quoteState?.key === quoteKey ? quoteState.error : undefined;
  const quoting = selectionValid && !pending && !quote && !quoteError;
  useEffect(() => {
    if (!selectionValid || pending) return;
    let active = true;
    const timer = setTimeout(() => {
      customerService.quote(JSON.parse(quoteKey)).then(pricing => { if (active) setQuoteState({ key: quoteKey, pricing }); })
        .catch(reason => { if (active) setQuoteState({ key: quoteKey, error: reason.message }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [quoteKey, selectionValid, pending, revision]);
  const frozen = busy || submitting || !!pending;
  async function mutate(action: () => Promise<unknown>) {
    setFailure(''); try { await action(); } catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Không thể cập nhật giỏ hàng.'); }
  }
  async function buy() {
    if (lock.current || !cart || (!pending && (!quote || !selectionValid || busy))) return;
    if (!checkoutMode && !pending) { navigate('/cart/checkout'); return; }
    if (!pending && !addressId) { setFailure('Vui lòng chọn địa chỉ nhận hàng.'); return; }
    lock.current = true; setSubmitting(true); setFailure('');
    const request = pending || { key: crypto.randomUUID(), body: { ...quoteBody, addressId, expectedTotal: quote!.total } };
    try {
      // Retain the exact intent across timeouts; never charge a newly generated request on retry.
      sessionStorage.setItem(pendingKey, JSON.stringify(request)); setPending(request);
      const result = await customerService.checkout(request.body, request.key);
      sessionStorage.removeItem(pendingKey); setPending(null); sessionStorage.removeItem(selectionKey); sessionStorage.removeItem(voucherKey);
      void refreshCart(); navigate('/account/checkouts/' + result.checkoutId);
    } catch (reason) {
      if (reason instanceof CustomerApiError && reason.status >= 400 && reason.status < 500 && reason.status !== 429) {
        sessionStorage.removeItem(pendingKey); setPending(null); setQuoteState(undefined); setRevision(value => value + 1); void refreshCart();
      }
      setFailure(reason instanceof Error ? reason.message : 'Chưa xác định được kết quả. Hãy thử lại yêu cầu đã lưu.');
    } finally { lock.current = false; setSubmitting(false); }
  }
  const displayed = checkoutMode ? chosen : items;
  return <div className="container cart-page commerce-page">
    <div className="section-heading"><div><span className="section-kicker">FLASHRUSH / {checkoutMode ? 'THANH TOÁN' : 'GIỎ HÀNG'}</span><h1><ShoppingCart />{checkoutMode ? 'Xác nhận đơn hàng' : 'Giỏ hàng của bạn'}</h1></div><button className="button button-secondary" disabled={loading || frozen} onClick={() => { setQuoteState(undefined); setRevision(value => value + 1); void refreshCart(); }}>Làm mới</button></div>
    <nav className="checkout-steps" aria-label="Các bước mua hàng"><Link to="/cart" aria-current={!checkoutMode ? 'step' : undefined}>01 Giỏ hàng</Link><span aria-current={checkoutMode ? 'step' : undefined}>02 Xác nhận đơn</span><span>03 Kết quả</span></nav>
    {checkoutMode && <Link className="text-link checkout-back" to="/cart"><ArrowLeft size={16} /> Trở lại giỏ hàng</Link>}
    <p className="customer-muted">Giỏ hàng được lưu theo tài khoản. Giá và tồn kho được xác thực lại khi đặt hàng; thêm vào giỏ không giữ chỗ sản phẩm.</p>
    {(error || failure) && <p className="customer-warning" role="alert">{failure || error}</p>}
    {pending && <div className="customer-warning">Có yêu cầu mua chưa xác định kết quả. <button className="text-link" disabled={submitting} onClick={() => void buy()}>Thử lại đúng yêu cầu đã lưu</button></div>}
    {!cart && loading ? <div className="customer-panel cart-skeleton" role="status" aria-label="Đang tải giỏ hàng"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : !displayed.length ? <EmptyState title={checkoutMode ? 'Chưa chọn sản phẩm thanh toán' : 'Giỏ hàng đang trống'} description="Chọn sản phẩm bạn yêu thích để bắt đầu mua sắm."><Link className="button button-primary" to={checkoutMode ? '/cart' : '/products?status=ALL'}>{checkoutMode ? 'Về giỏ hàng' : 'Khám phá ngay'}</Link></EmptyState> : <>
      {checkoutMode && <section className="customer-panel checkout-address"><h2><MapPin size={20} /> Địa chỉ nhận hàng</h2>{profile ? profile.addresses.length ? <label className="customer-form">Chọn địa chỉ<select value={addressId} onChange={e => setAddressId(e.target.value)} disabled={frozen}><option value="">Chọn địa chỉ nhận hàng</option>{profile.addresses.map(a => <option value={a.id} key={a.id}>{a.name} · {a.phone} · {a.street}, {a.ward}, {a.city}</option>)}</select></label> : <p>Chưa có địa chỉ nhận hàng. Thêm địa chỉ trước khi đặt hàng.</p> : <p role="status">Đang tải địa chỉ…</p>}<Link className="text-link" to="/account/addresses">Quản lý địa chỉ</Link></section>}
      <section className="cart-list customer-panel">
        {!checkoutMode && <label className="cart-select-all"><input type="checkbox" disabled={frozen} checked={available.length > 0 && available.every(line => selected.includes(line.lineId))} onChange={e => setSelected(e.target.checked ? available.map(line => line.lineId) : [])} />Chọn tất cả sản phẩm có thể mua ({available.length})</label>}
        <div className="cart-table-head" aria-hidden="true"><span /><span>Sản phẩm / phân loại</span><span>Đơn giá</span><span>Số lượng</span><span>Thành tiền</span><span /></div>
        {displayed.map(line => <article className={'cart-row' + (issue(line) ? ' cart-row-unavailable' : '')} key={line.lineId}>
          <input type="checkbox" aria-label={'Chọn ' + (line.product?.name || line.productId)} disabled={checkoutMode || !!issue(line) || frozen} checked={selected.includes(line.lineId)} onChange={e => setSelected(e.target.checked ? [...selected, line.lineId] : selected.filter(id => id !== line.lineId))} />
          <Link className="cart-product" to={'/products/' + encodeURIComponent(line.productId)}><ProductImage src={line.product?.images[0] || ''} alt={line.product?.name || 'Sản phẩm không còn tồn tại'} /><div><strong>{line.product?.name || line.productId}</strong><small>Phân loại: {line.color || 'Tiêu chuẩn'}</small>{line.product && <small className="cart-stock">{line.product.stock > 0 ? `Còn ${line.product.stock} sản phẩm` : 'Hết hàng'}</small>}{issue(line) && <small className="order-error">{customerMessage(issue(line))}</small>}</div></Link>
          <div className="cart-unit"><strong>{formatPrice(line.product?.price ?? line.unitPrice)}</strong>{line.product && line.product.originalPrice > line.product.price && <del>{formatPrice(line.product.originalPrice)}</del>}{line.priceChanged && !checkoutMode && <button className="text-link" disabled={frozen} onClick={() => void mutate(() => updateCart(items.map(item => item.lineId === line.lineId ? { ...item, unitPrice: item.product!.price } : item)))}>Chấp nhận giá mới</button>}</div>
          <div className="cart-quantity"><button aria-label={'Giảm số lượng ' + line.product?.name} disabled={checkoutMode || frozen || line.quantity <= 1} onClick={() => void mutate(() => updateCart(items.map(item => item.lineId === line.lineId ? { ...item, quantity: item.quantity - 1 } : item)))}>−</button><span aria-label="Số lượng">{line.quantity}</span><button aria-label={'Tăng số lượng ' + line.product?.name} disabled={checkoutMode || frozen || line.quantity >= Math.min(line.product?.stock || 0, 100)} onClick={() => void mutate(() => updateCart(items.map(item => item.lineId === line.lineId ? { ...item, quantity: item.quantity + 1 } : item)))}>+</button></div>
          <strong className="cart-subtotal">{formatPrice((line.product?.price ?? line.unitPrice) * line.quantity)}</strong>
          {!checkoutMode && <button className="cart-remove" aria-label={'Xóa ' + line.product?.name} disabled={frozen} onClick={() => setRemoveId(line.lineId)}><Trash2 size={18} /></button>}
        </article>)}
      </section>
      <div className="checkout-panels"><section className="customer-panel voucher-panel"><h2><TicketPercent size={20} /> FLASHRUSH Voucher</h2>{options && <p className="customer-muted">{options.voucher.code}: giảm {options.voucher.basisPoints / 100}% khi tiền sản phẩm được chọn từ {formatPrice(options.voucher.minimum)}.</p>}
        <form className="voucher-form" onSubmit={e => { e.preventDefault(); setQuoteState(undefined); setVoucher(voucherInput.trim().toUpperCase()); setRevision(value => value + 1); }}><label className="sr-only" htmlFor="voucher-code">Mã giảm giá</label><input id="voucher-code" placeholder="Nhập mã giảm giá" maxLength={30} value={voucherInput} disabled={frozen} onChange={e => setVoucherInput(e.target.value)} /><button className="button button-secondary" disabled={frozen || !selectionValid || !options || !voucherInput.trim()}>Áp dụng</button></form>
        {voucher && <button className="text-link voucher-remove" disabled={frozen} onClick={() => { setVoucher(''); setVoucherInput(''); }}>Bỏ mã {voucher}</button>}
        {quote?.voucherCode && <p className="voucher-success" role="status">Đã áp dụng {quote.voucherCode}: giảm {formatPrice(quote.discount)}.</p>}
        {quoteError && <p className="order-error" role="alert">{quoteError} <button className="text-link" onClick={() => { setQuoteState(undefined); setRevision(value => value + 1); }}>Thử lại</button></p>}
        {quoting && <p className="customer-muted" role="status">Đang xác thực giá và ưu đãi…</p>}
      </section>
      {checkoutMode && <section className="customer-panel checkout-methods"><h2><Truck size={20} /> Vận chuyển</h2>{options?.shipping.map(method => <label key={method.id}><input type="radio" name="shipping" value={method.id} checked={shippingMethod === method.id} disabled={frozen} onChange={() => setShipping(method.id)} /><span>{method.name}</span><strong>{method.fee === 0 ? 'Miễn phí' : formatPrice(method.fee)}</strong></label>)}<h2><CreditCard size={20} /> Thanh toán</h2>{options?.payments.map(method => <label key={method.id}><input type="radio" name="payment" value={method.id} checked={paymentMethod === method.id} disabled={frozen} onChange={() => setPayment(method.id)} />{method.name}</label>)}<small>Không thu tiền trực tuyến tại bước này.</small></section>}
      </div>
      {checkoutMode && <section className="customer-panel checkout-breakdown"><h2>Chi tiết thanh toán</h2><dl><div><dt>Tiền sản phẩm ({quantity})</dt><dd>{formatPrice(quote?.subtotal ?? localSubtotal)}</dd></div><div><dt>Giảm giá voucher</dt><dd>{quote ? '−' + formatPrice(quote.discount) : 'Chờ xác thực'}</dd></div><div><dt>Phí vận chuyển</dt><dd>{quote ? formatPrice(quote.shippingFee) : 'Chờ xác thực'}</dd></div><div className="checkout-payable"><dt>Tổng thanh toán</dt><dd>{quote ? formatPrice(quote.total) : 'Chờ xác thực'}</dd></div></dl></section>}
      <div className="cart-total" aria-live="polite"><div><span>Tổng thanh toán ({quantity} sản phẩm)</span><strong>{!quantity ? formatPrice(0) : quote ? formatPrice(quote.total) : 'Chờ xác thực'}</strong><small>Tiết kiệm voucher: {quote ? formatPrice(quote.discount) : '—'}</small>{chosen.length > 10 && <small className="order-error">Chọn tối đa 10 dòng sản phẩm.</small>}</div><button className="button button-primary" disabled={busy || submitting || (!pending && (!selectionValid || !quote || !options || (checkoutMode && !addressId)))} onClick={() => void buy()}>{submitting ? 'Đang gửi…' : pending ? 'Thử lại yêu cầu đã lưu' : checkoutMode ? 'Xác nhận đặt hàng' : 'Mua hàng'}</button></div>
    </>}
    <dialog ref={removeDialog} className="cart-confirm-dialog" aria-labelledby="cart-remove-title" onCancel={() => setRemoveId(undefined)}><h2 id="cart-remove-title">Xóa sản phẩm khỏi giỏ?</h2><p>{items.find(line => line.lineId === removeId)?.product?.name}</p><div className="address-actions"><button className="button button-secondary" disabled={busy} onClick={() => setRemoveId(undefined)}>Giữ lại</button><button className="button button-primary" disabled={busy} onClick={() => void mutate(async () => { await updateCart(items.filter(item => item.lineId !== removeId)); setSelected(ids => ids.filter(id => id !== removeId)); setRemoveId(undefined); notify('Đã xóa sản phẩm khỏi giỏ.'); })}>Xóa sản phẩm</button></div>{failure && <p role="alert">{failure}</p>}</dialog>
  </div>;
}
