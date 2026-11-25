import { lazy, Suspense, useEffect } from 'react';
import { Link, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { CustomerProvider } from './components/customer/CustomerProvider';
import { CustomerAuthPage } from './pages/CustomerAuthPage';
import { CartPage } from './pages/CartPage';
import { CustomerAccountPage, CustomerOrderPage } from './pages/CustomerAccountPage';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { EmptyState } from './components/common/EmptyState';
import { HomePage } from './pages/HomePage';
import { ProductListingPage } from './pages/ProductListingPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderProcessingPage } from './pages/OrderProcessingPage';
import { OrderResultPage } from './pages/OrderResultPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
const MonitoringDashboardPage = lazy(() => import('./pages/MonitoringDashboardPage').then(module => ({ default: module.MonitoringDashboardPage })));

function StorefrontLayout() {
  return <CustomerProvider><div className="storefront"><Header /><main id="main-content" tabIndex={-1}><Outlet /></main><Footer /></div></CustomerProvider>;
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
    const titles: Record<string, string> = {
      '/': 'Flash Sale hôm nay',
      '/products': 'Sản phẩm Flash Sale',
      '/cart/checkout': 'Xác nhận đơn hàng',
      '/auth': 'Đăng nhập và đăng ký', '/cart': 'Giỏ hàng', '/account': 'Tài khoản của tôi', '/account/orders': 'Đơn mua', '/account/addresses': 'Địa chỉ nhận hàng', '/account/password': 'Đổi mật khẩu',
      '/admin': 'Tổng quan Flash Sale',
      '/admin/products': 'Sản phẩm · Quản trị demo',
      '/admin/campaigns': 'Đợt Flash Sale',
      '/admin/orders': 'Đơn hàng · Quản trị demo',
      '/admin/monitoring': 'Giám sát hệ thống',
    };
    const title = titles[path] ?? (path.startsWith('/products/') ? 'Chi tiết sản phẩm' : path.startsWith('/admin/orders/') ? 'Chi tiết đơn hàng · Quản trị demo' : 'FLASHRUSH Demo');
    window.scrollTo(0, 0);
    document.title = `${title} | FLASHRUSH`;
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <Routes>
      <Route element={<StorefrontLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductListingPage />} />
        <Route path="/products/:productId" element={<ProductDetailPage />} />
        <Route path="/auth" element={<CustomerAuthPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/cart/checkout" element={<CartPage checkoutMode />} />
        <Route path="/account" element={<CustomerAccountPage />} />
        <Route path="/account/addresses" element={<CustomerAccountPage section="addresses" />} />
        <Route path="/account/password" element={<CustomerAccountPage section="password" />} />
        <Route path="/account/orders" element={<CustomerAccountPage section="orders" />} />
        <Route path="/account/orders/:id" element={<CustomerOrderPage />} />
        <Route path="/account/checkouts/:id" element={<CustomerOrderPage group />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrderHistoryPage />} />
        <Route path="/orders/:orderId/processing" element={<OrderProcessingPage />} />
        <Route path="/orders/:orderId/result" element={<OrderResultPage />} />
        <Route path="*" element={
          <div className="container">
            <EmptyState title="Trang này không tồn tại" description="Hãy quay về trang chủ để khám phá ưu đãi.">
              <Link className="button button-primary" to="/">Về trang chủ</Link>
            </EmptyState>
          </div>
        } />
      </Route>
      <Route path="/admin" element={<DashboardLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="products" element={<AdminDashboardPage section="products" />} />
        <Route path="campaigns" element={<AdminDashboardPage section="campaigns" />} />
        <Route path="orders" element={<AdminDashboardPage section="orders" />} />
        <Route path="orders/:orderId" element={<AdminDashboardPage section="detail" />} />
        <Route path="monitoring" element={<Suspense fallback={<p role="status">Đang tải biểu đồ giám sát...</p>}><MonitoringDashboardPage /></Suspense>} />
        <Route path="*" element={<AdminDashboardPage section="missing" />} />
      </Route>
    </Routes>
  );
}
