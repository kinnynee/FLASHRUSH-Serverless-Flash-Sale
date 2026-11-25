import { ShoppingCart, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { SearchBar } from './SearchBar';
import { BrandLogo } from './BrandLogo';
import { useCustomer } from '../customer/CustomerProvider';
import { ProductImage } from '../common/ProductImage';
import { formatPrice } from '../../utils/product';

export function Header() {
  const { user, ready, cart, loading, error, logout, refreshCart } = useCustomer();
  const [panel, setPanel] = useState({ key: '', value: '' });
  const location = useLocation();
  const opened = panel.key === location.key ? panel.value : '';
  const close = () => setPanel({ key: '', value: '' });
  const open = (value: string) => setPanel({ key: location.key, value });
  const count = cart?.items.reduce((sum, line) => sum + line.quantity, 0) || 0;
  return <><a className="skip-link" href="#main-content">Đến nội dung chính</a><header className="site-header">
    <div className="store-topline"><div className="container"><span>FLASHRUSH · Công nghệ trong tầm tay</span><Link to={user ? '/account/orders' : '/orders'}>Tra cứu đơn hàng</Link></div></div>
    <div className="container header-inner"><BrandLogo /><SearchBar /><div className="header-actions">
      {['cart', 'account'].map(kind => <div className="header-dropdown" key={kind} onMouseEnter={() => open(kind)} onMouseLeave={close} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }} onKeyDown={event => { if (event.key === 'Escape') { close(); event.currentTarget.querySelector('button')?.focus(); } }}>
        <button className="header-menu-trigger" aria-expanded={opened === kind} aria-controls={'header-' + kind} onClick={() => opened === kind ? close() : open(kind)}>{kind === 'cart' ? <ShoppingCart size={23} /> : <UserRound size={23} />}<span>{kind === 'cart' ? 'Giỏ hàng' : user?.name || 'Tài khoản'}</span>{kind === 'cart' && user && cart && count > 0 && <b className="cart-badge" aria-label={count + ' sản phẩm trong giỏ'}>{count}</b>}</button>
        {opened === kind && <section id={'header-' + kind} className="header-popover customer-popover" aria-label={kind === 'cart' ? 'Giỏ hàng' : 'Tài khoản'}>
          <button className="popover-close" aria-label="Đóng" onClick={close}><X size={18} /></button>
          <h2>{kind === 'cart' ? 'Giỏ hàng của bạn' : user ? 'Xin chào, ' + user.name : 'Chào mừng bạn!'}</h2>
          {!ready ? <p role="status">Đang kiểm tra phiên…</p> : !user ? <><p>Đăng nhập để lưu giỏ hàng và theo dõi đơn mua.</p><Link onClick={close} className="button button-primary" to={'/auth?next=' + (kind === 'cart' ? '/cart' : '/account')}>Đăng nhập</Link><Link onClick={close} className="button button-secondary" to="/auth?mode=register">Đăng ký</Link></> : kind === 'account' ? <nav className="account-menu"><Link to="/account" onClick={close}>Hồ sơ cá nhân</Link><Link to="/account/addresses" onClick={close}>Địa chỉ nhận hàng</Link><Link to="/account/orders" onClick={close}>Đơn mua</Link><Link to="/account/password" onClick={close}>Đổi mật khẩu</Link><button onClick={() => { close(); void logout(); }}>Đăng xuất</button></nav> : <>
            {loading && <p role="status">Đang cập nhật…</p>}{error && <p role="alert">{error} <button className="text-link" onClick={() => void refreshCart()}>Thử lại</button></p>}
            {cart && !cart.items.length && <p>Chưa có sản phẩm trong giỏ.</p>}
            <div className="mini-cart-items">{cart?.items.slice(0, 5).map(line => <Link key={line.lineId} className="mini-cart-line" to={'/products/' + encodeURIComponent(line.productId)} onClick={close}><ProductImage src={line.product?.images[0] || ''} alt={line.product?.name || line.productId} /><span>{line.product?.name || line.productId}<small>Số lượng: {line.quantity}</small></span><strong>{formatPrice(line.product?.price ?? line.unitPrice)}</strong></Link>)}</div>
            <Link className="button button-primary" onClick={close} to="/cart">Xem giỏ hàng</Link>
          </>}
        </section>}
      </div>)}
    </div></div>
    <div className="container header-navigation"><Navbar /><span>Ưu đãi theo thời gian thực</span></div>
  </header></>;
}
