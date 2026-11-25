import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trash2, ShoppingCart } from 'lucide-react';
import { useCustomer } from '../components/customer/CustomerProvider';
import { CustomerGate } from './CustomerAuthPage';
import { customerService, CustomerApiError, customerMessage, type Profile, type CheckoutInput } from '../services/customerService';
import { ProductImage } from '../components/common/ProductImage';
import { EmptyState } from '../components/common/EmptyState';
import { formatPrice } from '../utils/product';
import { getServerNow } from '../utils/serverClock';

export function CartPage() {
  const { user } = useCustomer();
  return <CustomerGate><CartContent key={user?.sub} /></CustomerGate>;
}
function CartContent() {
  const { user, cart, loading, error, busy, refreshCart, updateCart, notify } = useCustomer();
  const [params] = useSearchParams(); const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>(params.get('select') ? [params.get('select')!] : []);
  const [profile, setProfile] = useState<Profile>(); const [addressId, setAddressId] = useState('');
  const [failure, setFailure] = useState(''); const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(getServerNow()); const lock = useRef(false);
  const pendingKey = 'flashrush.checkout.pending.' + user!.sub;
  const [pending, setPending] = useState<{ key: string; body: CheckoutInput } | null>(() => { try { return JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch { return null; } });
  useEffect(() => {
    let active = true;
    customerService.profile().then(result => { if (active) { setProfile(result); setAddressId(result.defaultAddressId); } }).catch(reason => { if (active) setFailure(reason.message); });
    const timer = setInterval(() => setNow(getServerNow()), 1000);
    const refresh = () => { if (!document.hidden) void refreshCart(); };
    const interval = setInterval(refresh, 30000); window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [refreshCart]);
  const items = cart?.items || [];
  const issue = (line: typeof items[number]) => line.issue || (line.product && Date.parse(line.product.saleEndsAt) <= now ? 'SALE_ENDED' : '') || (line.priceChanged ? 'PRICE_CHANGED' : '');
  const available = items.filter(line => !issue(line));
  const chosen = items.filter(line => selected.includes(line.lineId));
  const total = chosen.reduce((sum, line) => sum + (line.product?.price ?? line.unitPrice) * line.quantity, 0);
  async function mutate(action: () => Promise<unknown>) {
    setFailure(''); try { await action(); } catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Không thể cập nhật giỏ hàng.'); }
  }
  async function buy() {
    if (lock.current || !cart) return;
    lock.current = true; setSubmitting(true); setFailure('');
    const request = pending || { key: crypto.randomUUID(), body: { version: cart.version, lineIds: chosen.map(line => line.lineId), addressId } };
    try {
      // Persist before sending so a lost response always retries the same intent.
      sessionStorage.setItem(pendingKey, JSON.stringify(request)); setPending(request);
      const result = await customerService.checkout(request.body, request.key);
      sessionStorage.removeItem(pendingKey); setPending(null); void refreshCart();
      navigate('/account/checkouts/' + result.checkoutId);
    } catch (reason) {
      if (reason instanceof CustomerApiError && reason.status >= 400 && reason.status < 500 && reason.status !== 429) {
        sessionStorage.removeItem(pendingKey); setPending(null); void refreshCart();
      }
      setFailure(reason instanceof Error ? reason.message : 'Chưa xác định được kết quả. Hãy thử lại yêu cầu đã lưu.');
    } finally { lock.current = false; setSubmitting(false); }
  }
  return <div className="container cart-page"><div className="section-heading"><div><span className="section-kicker">FLASHRUSH / MUA SẮM</span><h1><ShoppingCart /> Giỏ hàng của bạn</h1></div><button className="button button-secondary" disabled={loading || busy} onClick={() => void refreshCart()}>Làm mới</button></div>
    <p className="customer-muted">Thêm vào giỏ không giữ chỗ tồn kho. Giá và số lượng được kiểm tra lại khi đặt hàng.</p>
    {(error || failure) && <p className="customer-warning" role="alert">{failure || error}</p>}
    {pending && <div className="customer-warning">Có yêu cầu mua chưa xác định kết quả. <button className="text-link" disabled={submitting} onClick={() => void buy()}>Thử lại đúng yêu cầu đã lưu</button></div>}
    {!cart && loading ? <div className="customer-panel skeleton" role="status">Đang tải giỏ hàng…</div> : !items.length ? <EmptyState title="Giỏ hàng đang trống" description="Khám phá các đợt Flash Sale và thêm sản phẩm yêu thích."><Link className="button button-primary" to="/products?status=ALL">Khám phá ngay</Link></EmptyState> : <>
      <section className="cart-list customer-panel"><label className="cart-select-all"><input type="checkbox" disabled={busy || submitting || !!pending} checked={available.length > 0 && available.every(line => selected.includes(line.lineId))} onChange={e => setSelected(e.target.checked ? available.map(line => line.lineId) : [])} />Chọn tất cả sản phẩm có thể mua ({available.length})</label>
        {items.map(line => <article className="cart-row" key={line.lineId}>
          <input type="checkbox" aria-label={'Chọn ' + (line.product?.name || line.productId)} disabled={!!issue(line) || busy || submitting || !!pending} checked={selected.includes(line.lineId)} onChange={e => setSelected(e.target.checked ? [...selected, line.lineId] : selected.filter(id => id !== line.lineId))} />
          <Link className="cart-product" to={'/products/' + encodeURIComponent(line.productId)}><ProductImage src={line.product?.images[0] || ''} alt={line.product?.name || 'Sản phẩm không còn tồn tại'} /><div><strong>{line.product?.name || line.productId}</strong>{line.color && <small>Phân loại: {line.color}</small>}{issue(line) && <small className="order-error">{customerMessage(issue(line))}</small>}</div></Link>
          <div className="cart-unit"><strong>{formatPrice(line.product?.price ?? line.unitPrice)}</strong>{line.product && <del>{formatPrice(line.product.originalPrice)}</del>}{line.priceChanged && <button className="text-link" disabled={busy || !!pending} onClick={() => void mutate(() => updateCart(items.map(item => item.lineId === line.lineId ? { ...item, unitPrice: item.product!.price } : item)))}>Chấp nhận giá mới</button>}</div>
          <div className="cart-quantity"><button aria-label={'Giảm số lượng ' + line.product?.name} disabled={busy || submitting || !!pending || line.quantity <= 1} onClick={() => void mutate(() => updateCart(items.map(item => item.lineId === line.lineId ? { ...item, quantity: item.quantity - 1 } : item)))}>−</button><span aria-label="Số lượng">{line.quantity}</span><button aria-label={'Tăng số lượng ' + line.product?.name} disabled={busy || submitting || !!pending || line.quantity >= Math.min(line.product?.stock || 0, 100)} onClick={() => void mutate(() => updateCart(items.map(item => item.lineId === line.lineId ? { ...item, quantity: item.quantity + 1 } : item)))}>+</button></div>
          <strong className="cart-subtotal">{formatPrice((line.product?.price ?? line.unitPrice) * line.quantity)}</strong>
          <button className="cart-remove" aria-label={'Xóa ' + line.product?.name} disabled={busy || submitting || !!pending} onClick={() => void mutate(async () => { await updateCart(items.filter(item => item.lineId !== line.lineId)); notify('Đã xóa sản phẩm khỏi giỏ.'); })}><Trash2 size={18} /></button>
        </article>)}
      </section>
      <section className="customer-panel customer-form"><h2>Địa chỉ nhận hàng</h2>{profile ? profile.addresses.length ? <label>Chọn địa chỉ<select value={addressId} onChange={e => setAddressId(e.target.value)} disabled={submitting || !!pending}>{profile.addresses.map(a => <option value={a.id} key={a.id}>{a.name} · {a.street}, {a.ward}, {a.city}</option>)}</select></label> : <p>Chưa có địa chỉ nhận hàng.</p> : <p>Đang tải thông tin địa chỉ…</p>}<Link className="text-link" to="/account/addresses">Quản lý địa chỉ</Link></section>
      <div className="cart-total"><div><span>Tổng tiền ({chosen.length} sản phẩm)</span><strong>{formatPrice(total)}</strong><small>Tối đa 10 dòng sản phẩm mỗi lần mua.</small></div><button className="button button-primary" disabled={busy || submitting || (!pending && (!chosen.length || chosen.length > 10 || !addressId || chosen.some(line => !!issue(line))))} onClick={() => void buy()}>{submitting ? 'Đang gửi…' : pending ? 'Thử lại yêu cầu đã lưu' : 'Mua hàng'}</button></div>
    </>}
  </div>;
}
