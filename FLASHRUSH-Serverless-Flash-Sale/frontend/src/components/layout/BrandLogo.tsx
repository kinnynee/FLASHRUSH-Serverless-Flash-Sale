import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BrandLogo() {
  return (
    <Link className="brand" to="/" aria-label="FLASHRUSH — Trang chủ">
      <Zap fill="currentColor" strokeWidth={0} />
      FLASHRUSH
    </Link>
  );
}
