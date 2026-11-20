import { Navbar } from './Navbar';
import { SearchBar } from './SearchBar';
import { BrandLogo } from './BrandLogo';
export function Header() {
  return <><a className="skip-link" href="#main-content">Đến nội dung chính</a><header className="site-header"><div className="container header-inner"><BrandLogo /><Navbar /><SearchBar /></div></header></>;
}
