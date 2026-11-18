import { Link, useLocation } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
/** Routing boundary only. Replace these two routes with Developer 2's pages. */
export function IntegrationPlaceholder() {
  const { pathname } = useLocation();
  return <div className="container"><EmptyState title={pathname === '/checkout' ? 'Checkout đang được chuẩn bị' : 'Đơn hàng của tôi đang được chuẩn bị'} description="Màn hình do Frontend Developer 2 phụ trách, chưa được tích hợp trong bản demo này. Chưa có đơn hàng hay giao dịch thực tế."><Link className="button button-primary" to="/products">Tiếp tục khám phá sản phẩm</Link></EmptyState></div>;
}
