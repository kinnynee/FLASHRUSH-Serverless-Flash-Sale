import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useCustomer } from '../components/customer/CustomerProvider';
import { customerConfigured, signUp, confirmSignUp, resendConfirmation, forgotPassword, resetPassword } from '../services/customerAuth';
import { EmptyState } from '../components/common/EmptyState';

export function CustomerGate({ children }: { children: ReactNode }) {
  const { ready, user } = useCustomer();
  if (!ready) return <p className="container page-state" role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!customerConfigured) return <div className="container"><EmptyState title="Tài khoản đang chờ kết nối" description="Cognito và API khách hàng chưa được cấu hình cho môi trường này. Chức năng sẽ sử dụng dữ liệu thật sau khi triển khai được xác nhận."><Link className="button button-primary" to="/products?status=ALL">Tiếp tục khám phá</Link></EmptyState></div>;
  if (!user) return <Navigate to={'/auth?next=' + encodeURIComponent(location.pathname + location.search)} replace />;
  return children;
}
export function CustomerAuthPage() {
  const { login, user, ready, notify } = useCustomer();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState(''); const [name, setName] = useState('');
  const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const navigate = useNavigate();
  const target = params.get('next') || '/account';
  const next = /^\/(?:cart|products(?:\/[^?#]*)?|account(?:\/[^?#]*)?)(?:\?[^#]*)?$/.test(target) ? target : '/account';
  if (ready && user) return <Navigate to={next} replace />;
  const titles: Record<string, string> = { login: 'Đăng nhập', register: 'Tạo tài khoản', confirm: 'Xác minh email', forgot: 'Quên mật khẩu', reset: 'Đặt lại mật khẩu' };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if (mode === 'login') { await login(email, password); setPassword(''); navigate(next, { replace: true }); }
      if (mode === 'register') { await signUp(email, password, name); setPassword(''); setMode('confirm'); notify('Kiểm tra email để nhận mã xác minh.'); }
      if (mode === 'confirm') { await confirmSignUp(email, code); setMode('login'); setCode(''); notify('Email đã xác minh. Bạn có thể đăng nhập.'); }
      if (mode === 'forgot') { await forgotPassword(email); setMode('reset'); notify('Nếu tài khoản tồn tại, mã khôi phục sẽ được gửi đến email.'); }
      if (mode === 'reset') { await resetPassword(email, code, password); setPassword(''); setCode(''); setMode('login'); notify('Đã đổi mật khẩu. Vui lòng đăng nhập.'); }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'UserNotConfirmedException') { setMode('confirm'); setPassword(''); }
      setError(reason instanceof Error ? reason.message : 'Không thể kết nối dịch vụ đăng nhập.');
    } finally { setBusy(false); }
  }
  return <div className="container auth-layout"><section className="auth-brand"><span className="section-kicker">CHÀO MỪNG ĐẾN FLASHRUSH</span><h1>Ưu đãi của bạn.<br />Tài khoản của bạn.</h1><p>Lưu giỏ hàng, quản lý địa chỉ và theo dõi từng đơn mua.</p></section><form className="customer-panel customer-form" onSubmit={submit}>
    <h2>{titles[mode]}</h2>
    {!customerConfigured && <p className="customer-warning" role="status">Chưa cấu hình Cognito cho môi trường này. Các nút xác thực sẽ hoạt động khi có kết nối thật.</p>}
    {mode === 'register' && <label>Họ tên<input required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>}
    <label>Email<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
    {['login', 'register', 'reset'].includes(mode) && <label>Mật khẩu<input aria-label="Mật khẩu" required type="password" minLength={mode === 'login' ? 1 : 12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} />{mode !== 'login' && <small>Tối thiểu 12 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.</small>}</label>}
    {['confirm', 'reset'].includes(mode) && <label>Mã xác minh<input required inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} /></label>}
    {error && <p role="alert" className="order-error">{error}</p>}
    <button className="button button-primary" disabled={busy || !customerConfigured}>{busy ? 'Đang xử lý…' : titles[mode]}</button>
    <div className="auth-links">{['login','register','forgot'].filter(value => value !== mode).map(value => <button type="button" key={value} disabled={busy} onClick={() => { setMode(value); setError(''); setPassword(''); }}>{titles[value]}</button>)}</div>
    {mode === 'confirm' && <button type="button" className="text-link" disabled={busy || !customerConfigured} onClick={async () => { setBusy(true); try { await resendConfirmation(email); notify('Đã gửi lại mã xác minh.'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể gửi mã.'); } finally { setBusy(false); } }}>Gửi lại mã xác minh</button>}
  </form></div>;
}
