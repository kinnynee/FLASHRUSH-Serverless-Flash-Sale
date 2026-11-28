import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { accessToken, businessRequest, type Account } from '../../services/accountService';

export function staffCanVisit(roles: string[], path: string) {
  if (roles.includes('owner')) return true;
  if (path.startsWith('/admin/users')) return false;
  if (path.startsWith('/admin/inventory')) return roles.some(role => ['manager', 'warehouse'].includes(role));
  if (path.startsWith('/admin/customers') || path === '/admin' || path.startsWith('/admin/orders')) return roles.some(role => ['manager', 'support'].includes(role));
  return roles.includes('manager');
}

export function StaffGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [token, setToken] = useState(accessToken);
  useEffect(() => {
    const changed = () => setToken(accessToken());
    window.addEventListener('staff-session-changed', changed);
    const timer = setInterval(changed, 1000);
    return () => { window.removeEventListener('staff-session-changed', changed); clearInterval(timer); };
  }, []);
  if (!token) return <Navigate to={'/auth?next=' + encodeURIComponent(pathname)} replace />;
  return <VerifiedStaff key={token + pathname} path={pathname}>{children}</VerifiedStaff>;
}

function VerifiedStaff({ children, path }: { children: ReactNode; path: string }) {
  const [user, setUser] = useState<Account>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    businessRequest('/auth/me').then(account => { if (active) setUser(account); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  if (error) return <div className="container"><p role="alert">{error}</p><Link to="/auth?next=/admin">Đăng nhập nhân viên</Link></div>;
  if (!user) return <p role="status">Đang kiểm tra quyền truy cập…</p>;
  if (!staffCanVisit(user.roles, path)) return <div className="container"><p role="alert">Tài khoản không có quyền truy cập chức năng này.</p><Link to="/auth?next=/admin">Tài khoản nhân viên</Link>{user.roles.includes('warehouse') && <Link to="/admin/inventory"> Quản lý tồn kho</Link>}</div>;
  return children;
}
