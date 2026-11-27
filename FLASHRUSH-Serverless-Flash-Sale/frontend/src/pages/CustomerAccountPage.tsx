import { formatPrice } from '../utils/product';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { UserRound, MapPin, Package, LockKeyhole, LogOut } from 'lucide-react';
import { CustomerGate } from './CustomerAuthPage';
import { useCustomer } from '../components/customer/CustomerProvider';
import { customerService, customerMessage, type Profile, type Address, type CustomerOrder } from '../services/customerService';
import { productService } from '../services/productService';
import { changePassword } from '../services/customerAuth';
import { OrderStatusBadge } from '../components/order/OrderStatusBadge';
import { OrderSummary } from '../components/order/OrderSummary';
import { OrderProgress } from '../components/order/OrderProgress';
import { EmptyState } from '../components/common/EmptyState';
import { isTerminal, type OrderStatus } from '../types/order';

function AccountFrame({ children }: { children: ReactNode }) {
  const { user, logout } = useCustomer();
  return <div className="container account-layout"><aside className="account-sidebar"><div className="account-identity"><UserRound /><div><strong>{user?.name}</strong><small>{user?.email}</small></div></div><nav aria-label="Tài khoản của tôi">
    <NavLink end to="/account"><UserRound size={18} />Hồ sơ cá nhân</NavLink><NavLink to="/account/addresses"><MapPin size={18} />Địa chỉ nhận hàng</NavLink><NavLink to="/account/orders"><Package size={18} />Đơn mua</NavLink><NavLink to="/account/password"><LockKeyhole size={18} />Đổi mật khẩu</NavLink><button onClick={() => void logout()}><LogOut size={18} />Đăng xuất</button>
  </nav></aside><section className="account-content">{children}</section></div>;
}
export function CustomerAccountPage({ section = 'profile' }: { section?: string }) {
  const { user } = useCustomer();
  return <CustomerGate><AccountFrame><AccountContent key={(user?.sub || '') + section} section={section} /></AccountFrame></CustomerGate>;
}
function AccountContent({ section }: { section: string }) {
  const { notify, logout, updateName } = useCustomer();
  const [profile, setProfile] = useState<Profile>(); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Address | null>(null);
  const [previous, setPrevious] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  useEffect(() => {
    if (!['profile', 'addresses'].includes(section)) return;
    let active = true; setError('');
    customerService.profile().then(result => { if (active) setProfile(result); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [section, revision]);
  async function save(next: Profile) {
    if (busy) return; setBusy(true); setError('');
    try { const saved = await customerService.saveProfile(next); setProfile(saved); updateName(saved.name); setEditing(null); notify('Đã lưu thay đổi.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu thông tin.'); }
    finally { setBusy(false); }
  }
  async function passwordSubmit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (password !== confirm) { setError('Mật khẩu xác nhận không khớp.'); return; }
    setBusy(true);
    try { await changePassword(previous, password); setPrevious(''); setPassword(''); setConfirm(''); await logout(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể đổi mật khẩu.'); }
    finally { setBusy(false); }
  }
  if (section === 'orders') return <AccountOrders />;
  return <div className="customer-panel"><h1>{section === 'profile' ? 'Hồ sơ của tôi' : section === 'addresses' ? 'Địa chỉ nhận hàng' : 'Đổi mật khẩu'}</h1><p className="customer-muted">Quản lý thông tin để mua sắm thuận tiện hơn.</p>
    {error && <p role="alert" className="customer-warning">{error} <button className="text-link" disabled={busy} onClick={() => setRevision(value => value + 1)}>Tải lại</button></p>}
    {section === 'password' ? <form className="customer-form" onSubmit={passwordSubmit}><label>Mật khẩu hiện tại<input required type="password" autoComplete="current-password" value={previous} onChange={e => setPrevious(e.target.value)} /></label><label>Mật khẩu mới<input aria-label="Mật khẩu mới" required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /><small>Tối thiểu 12 ký tự: chữ hoa, chữ thường, số, ký tự đặc biệt.</small></label><label>Xác nhận mật khẩu mới<input required type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Đổi mật khẩu và đăng xuất'}</button></form>
      : !profile ? <p role="status">{error ? 'Chưa tải được hồ sơ.' : 'Đang tải hồ sơ…'}</p>
      : section === 'profile' ? <form className="customer-form profile-form" onSubmit={event => { event.preventDefault(); void save(profile); }}>
        <div className="profile-avatar">{profile.avatar ? <img src={profile.avatar} alt="Ảnh đại diện" referrerPolicy="no-referrer" /> : <UserRound size={48} />}</div>
        <label>Ảnh đại diện (URL HTTPS)<input type="url" maxLength={2048} placeholder="https://…" value={profile.avatar} onChange={e => setProfile({ ...profile, avatar: e.target.value })} /></label>
        <label>Họ tên<input required maxLength={100} autoComplete="name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label>
        <label>Email đã xác minh<input readOnly type="email" value={profile.email} /><small>Email đăng nhập được quản lý bởi Cognito.</small></label>
        <label>Số điện thoại<input type="tel" maxLength={20} autoComplete="tel" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></label><button className="button button-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
      </form> : <>
        <button className="button button-primary" disabled={busy || profile.addresses.length >= 10} onClick={() => setEditing({ id: crypto.randomUUID(), name: profile.name, phone: profile.phone, street: '', ward: '', city: '' })}>Thêm địa chỉ mới</button>
        {!profile.addresses.length && <p className="customer-muted">Bạn chưa lưu địa chỉ nào.</p>}
        {profile.addresses.map(address => <article className="address-card" key={address.id}><h3>{address.name} <small>{address.phone}</small></h3><p>{address.street}, {address.ward}, {address.city}</p>{profile.defaultAddressId === address.id && <span className="address-default">Mặc định</span>}<div className="address-actions"><button className="text-link" disabled={busy} onClick={() => setEditing(address)}>Chỉnh sửa</button><button className="text-link" disabled={busy} onClick={() => { const addresses = profile.addresses.filter(a => a.id !== address.id); void save({ ...profile, addresses, defaultAddressId: profile.defaultAddressId === address.id ? addresses[0]?.id || '' : profile.defaultAddressId }); }}>Xóa</button>{profile.defaultAddressId !== address.id && <button className="text-link" disabled={busy} onClick={() => void save({ ...profile, defaultAddressId: address.id })}>Đặt mặc định</button>}</div></article>)}
        {editing && <form className="customer-form address-editor" onSubmit={event => { event.preventDefault(); const addresses = [...profile.addresses.filter(a => a.id !== editing.id), editing]; void save({ ...profile, addresses, defaultAddressId: profile.defaultAddressId || editing.id }); }}><h2>Thông tin địa chỉ</h2>{(['name', 'phone', 'street', 'ward', 'city'] as const).map(field => <label key={field}>{{ name: 'Người nhận', phone: 'Điện thoại', street: 'Số nhà, tên đường', ward: 'Phường / xã', city: 'Tỉnh / thành phố' }[field]}<input required maxLength={field === 'street' ? 200 : 100} type={field === 'phone' ? 'tel' : 'text'} value={editing[field]} onChange={e => setEditing({ ...editing, [field]: e.target.value })} /></label>)}<div className="address-actions"><button className="button button-primary" disabled={busy}>Lưu địa chỉ</button><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Hủy</button></div></form>}
      </>}
  </div>;
}
const statuses: { value: OrderStatus | 'ALL'; label: string }[] = [{ value: 'ALL', label: 'Tất cả' }, { value: 'PENDING', label: 'Đang chờ' }, { value: 'CONFIRMED', label: 'Đã xác nhận' }, { value: 'OUT_OF_STOCK', label: 'Hết hàng' }, { value: 'FAILED', label: 'Thất bại' }];
function AccountOrders() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]); const [filter, setFilter] = useState('ALL');
  const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; setBusy(true); setError(''); customerService.orders().then(result => { if (active) { setOrders(result.items); setCursor(result.nextCursor); } }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [revision]);
  const shown = orders.filter(order => filter === 'ALL' || order.status === filter || (filter === 'PENDING' && order.status === 'PROCESSING'));
  return <><div className="customer-panel"><div className="section-heading"><h1>Đơn mua của tôi</h1><button className="button button-secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>Làm mới</button></div><div className="account-order-tabs">{statuses.map(status => <button key={status.value} aria-pressed={filter === status.value} className={filter === status.value ? 'selected' : ''} onClick={() => setFilter(status.value)}>{status.label}</button>)}</div><p className="customer-muted">Lọc trên {orders.length} đơn đã tải. Tải thêm để xem các đơn trước đó.</p><Link className="text-link" to="/orders">Lịch sử mua không đăng nhập trên thiết bị này</Link></div>
    {error && <p className="customer-warning" role="alert">{error}</p>}{busy && <p role="status">Đang tải đơn hàng…</p>}
    {!busy && !shown.length && !error && <EmptyState title="Chưa có đơn mua phù hợp" description="Các đơn mới sẽ xuất hiện sau khi bạn đặt hàng."><Link className="button button-primary" to="/products?status=ALL">Mua sắm ngay</Link></EmptyState>}
    {shown.map(order => <article className="customer-panel" key={order.orderId}><div className="history-card-head"><strong>{order.orderId}</strong><OrderStatusBadge status={order.status} /></div><OrderSummary item={order.item} />{(order.discount ?? 0)>0&&<div className="voucher-order-summary"><p>Voucher {order.voucherCode}: −{formatPrice(order.discount!)}</p><strong>Sau giảm: {formatPrice(order.totalAmount!)}</strong></div>}<div className="address-actions"><Link className="button button-secondary" to={'/account/orders/' + order.orderId}>Chi tiết đơn hàng</Link><Link className="text-link" to={'/account/checkouts/' + order.checkoutId}>Theo dõi nhóm đơn</Link></div></article>)}
    {cursor && <button className="button button-secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await customerService.orders(cursor); setOrders(previous => [...previous, ...result.items.filter(next => !previous.some(old => old.orderId === next.orderId))]); setCursor(result.nextCursor); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tải đơn hàng.'); } finally { setBusy(false); } }}>Tải thêm đơn hàng</button>}
  </>;
}
export function CustomerOrderPage({ group = false }: { group?: boolean }) {
  const { user } = useCustomer(); const { id = '' } = useParams();
  return <CustomerGate><AccountFrame><OrderDetail key={(user?.sub || '') + id} id={id} group={group} /></AccountFrame></CustomerGate>;
}
function OrderDetail({ id, group }: { id: string; group: boolean }) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0); const [stopped, setStopped] = useState(false);
  const { add, notify } = useCustomer();
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined; let attempts = 0; setStopped(false);
    async function load() {
      if (!active) return;
      try {
        const result = group ? (await customerService.checkoutStatus(id)).orders : [await customerService.order(id)];
        if (!active) return; setOrders(result); setError('');
        if (result.some(order => !isTerminal(order.status))) { if (++attempts < 30) timer = setTimeout(() => void load(), 3000); else setStopped(true); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Không thể tải đơn hàng.'); }
      finally { if (active) setBusy(false); }
    }
    void load(); return () => { active = false; clearTimeout(timer); };
  }, [id, group, revision]);
  return <><div className="customer-panel"><h1>{group ? 'Kết quả mua hàng' : 'Chi tiết đơn hàng'}</h1><p className="customer-muted">Mỗi sản phẩm có mã đơn riêng. Các sản phẩm cùng lần mua được kiểm tra và chốt tồn kho cùng nhau.</p><button className="button button-secondary" disabled={busy} onClick={() => { setBusy(true); setRevision(value => value + 1); }}>Kiểm tra lại</button><Link className="text-link" to="/account/orders"> Tất cả đơn mua</Link>{stopped && <p role="status">Đã tạm dừng tự động cập nhật. Bấm Kiểm tra lại để tiếp tục.</p>}</div>
    {busy && <p role="status">Đang kiểm tra đơn hàng…</p>}{error && <p className="customer-warning" role="alert">{error}</p>}
    {orders.map(order => <section className="customer-panel" key={order.orderId}><div className="history-card-head"><strong>{order.orderId}</strong><OrderStatusBadge status={order.status} /></div><OrderProgress status={order.status} createdAt={Date.parse(order.createdAt)} lastChecked={Date.parse(order.updatedAt)} /><OrderSummary item={order.item} />{(order.discount ?? 0)>0&&<div className="voucher-order-summary"><p>Voucher {order.voucherCode}: −{formatPrice(order.discount!)}</p><strong>Sau giảm: {formatPrice(order.totalAmount!)}</strong></div>}<h3>Địa chỉ nhận hàng</h3><p>{order.address.name} · {order.address.phone}</p><p>{order.address.street}, {order.address.ward}, {order.address.city}</p>{order.failureReason && <p className="order-error">{customerMessage(order.failureReason)}</p>}{isTerminal(order.status) && <button className="button button-secondary" disabled={busy} onClick={async () => { setBusy(true); try { const product = await productService.getProductById(order.item.productId); if (!product) throw new Error('Sản phẩm không còn tồn tại.'); await add(product, order.item.quantity, order.item.selectedColor || ''); } catch (reason) { notify(reason instanceof Error ? reason.message : 'Không thể thêm lại sản phẩm.'); } finally { setBusy(false); } }}>Thêm lại vào giỏ</button>}</section>)}
  </>;
}
