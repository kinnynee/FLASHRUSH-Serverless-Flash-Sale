import { Link } from 'react-router-dom';
import { accessToken, logout } from '../../services/accountService';

export function AdminApiKeyControl({ onChange }: { onChange: () => void }) {
  return <div className="monitoring-connection"><Link to="/staff/login">Tài khoản nhân viên</Link>{accessToken() && <button type="button" className="text-link" onClick={() => { void logout().catch(() => {}).finally(onChange); }}>Đăng xuất</button>}</div>;
}
