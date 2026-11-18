import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Navbar } from './Navbar';
import { SearchBar } from './SearchBar';
export function Header() {
  return <><a className="skip-link" href="#main-content">Đến nội dung chính</a><div className="announcement"><Zap size={13} /> Săn ưu đãi mỗi ngày <span>•</span> Trải nghiệm Flash Sale với dữ liệu mô phỏng</div><header className="site-header"><div className="container header-inner"><Link className="brand" to="/" aria-label="FLASHRUSH — Trang chủ"><Zap fill="currentColor" strokeWidth={0} />FLASHRUSH</Link><Navbar /><span className="demo-badge header-demo">Dữ liệu mô phỏng</span><SearchBar /></div></header></>;
}
