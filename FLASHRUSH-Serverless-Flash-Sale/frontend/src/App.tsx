import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
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
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); document.title = `${pathname === '/' ? 'Flash Sale hôm nay' : pathname === '/products' ? 'Sản phẩm Flash Sale' : pathname.startsWith('/products/') ? 'Chi tiết sản phẩm' : 'FLASHRUSH Demo'} | FLASHRUSH`; document.getElementById('main-content')?.focus({ preventScroll: true }); }, [pathname]);
  return <><Header /><main id="main-content" tabIndex={-1}><Routes><Route path="/" element={<HomePage />} /><Route path="/products" element={<ProductListingPage />} /><Route path="/products/:productId" element={<ProductDetailPage />} /><Route path="/checkout" element={<CheckoutPage />} /><Route path="/orders" element={<OrderHistoryPage />} /><Route path="/orders/:orderId/processing" element={<OrderProcessingPage />} /><Route path="/orders/:orderId/result" element={<OrderResultPage />} /><Route path="*" element={<div className="container"><EmptyState title="Trang này không tồn tại" description="Hãy quay về trang chủ để khám phá ưu đãi."><Link className="button button-primary" to="/">Về trang chủ</Link></EmptyState></div>} /></Routes></main><Footer /></>;
}
