import { Zap } from 'lucide-react';
import { Navbar } from './Navbar';
import { SearchBar } from './SearchBar';
import { BrandLogo } from './BrandLogo';
export function Header() {
  return <><a className="skip-link" href="#main-content">Đến nội dung chính</a><div className="announcement"><Zap size={13} /> Săn ưu đãi mỗi ngày <span>•</span> Trải nghiệm Flash Sale với dữ liệu mô phỏng</div><header className="site-header"><div className="container header-inner"><BrandLogo /><Navbar /><span className="demo-badge header-demo">Dữ liệu mô phỏng</span><SearchBar /></div></header></>;
}
