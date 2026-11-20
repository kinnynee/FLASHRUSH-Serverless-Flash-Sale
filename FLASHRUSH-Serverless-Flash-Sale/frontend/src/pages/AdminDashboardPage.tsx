import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { AdminTopbar } from '../components/admin/AdminTopbar';
import { ProductInventoryTable, RecentOrdersTable } from '../components/admin/AdminTables';
import { EmptyState } from '../components/common/EmptyState';
import { DashboardContent, formatSnapshotTime, MonitoringStatusBadge, OrderMetricsOverview } from '../components/dashboard/DashboardCommon';
import { useDashboard } from '../components/dashboard/DashboardLayout';
import { OrderStatusBadge } from '../components/order/OrderStatusBadge';
import { OrderSummary } from '../components/order/OrderSummary';
import type { OrderRecord } from '../types/order';

const pages = {
  overview: ['Tổng quan Flash Sale', 'Theo dõi sản phẩm, tồn kho và kết quả đặt hàng.'],
  products: ['Sản phẩm', 'Xem tồn kho của phiên Flash Sale mô phỏng.'],
  orders: ['Đơn hàng', 'Theo dõi yêu cầu đã tiếp nhận và trạng thái xử lý.'],
  detail: ['Chi tiết đơn hàng', 'Thông tin chỉ đọc của đơn hàng mô phỏng.'],
  missing: ['Trang quản trị không tồn tại', 'Quay về tổng quan để tiếp tục phiên demo.'],
} as const;

function OrderDetail({ order }: { order?: OrderRecord }) {
  const backLink = <Link className="button button-secondary" to="/admin/orders"><ArrowLeft size={16} /> Danh sách đơn hàng</Link>;
  if (!order) return <EmptyState title="Không tìm thấy đơn hàng" description="Mã đơn không có trong snapshot hiện tại.">{backLink}</EmptyState>;
  return (
    <section className="dash-card dash-order-detail">
      <div className="dash-section-heading">
        <div><h2>#{order.orderId}</h2><p>Tạo lúc {formatSnapshotTime(order.createdAt)} (GMT+7)</p></div>
        <OrderStatusBadge status={order.status} />
      </div>
      <OrderSummary item={order.item} />
      {backLink}
    </section>
  );
}

export function AdminDashboardPage({ section = 'overview' }: { section?: keyof typeof pages }) {
  const { orderId } = useParams();
  const { result } = useDashboard();
  const snapshot = result.status === 'success' ? result.snapshot : undefined;
  const [title, description] = pages[section];

  return (
    <>
      <AdminTopbar />
      <div className="dash-admin">
        <AdminSidebar />
        <main id="main-content" tabIndex={-1} className="dash-admin-main">
        <header className="dash-admin-header dash-heading">
          <div><h1>{title}</h1><p>{description}</p></div>
          <div className="dash-header-badges">
            <span className="dash-tag dash-amber"><span className="dash-dot" />Dữ liệu mô phỏng</span>
            {snapshot && <span className="dash-tag">Phiên #{snapshot.sessionId}</span>}
            <MonitoringStatusBadge snapshot={snapshot} />
          </div>
        </header>
        <div className="dash-admin-body dash-stack">
          {section === 'missing' ? (
            <EmptyState title="Không tìm thấy trang" description="Đường dẫn này không thuộc khu vực quản trị demo.">
              <Link className="button button-primary" to="/admin">Về tổng quan</Link>
            </EmptyState>
          ) : (
            <DashboardContent>{data => <>
              {section === 'overview' && <OrderMetricsOverview orders={data.orders} />}
              {(section === 'overview' || section === 'products') && <ProductInventoryTable products={data.products} />}
              {(section === 'overview' || section === 'orders') && <RecentOrdersTable orders={data.orderRecords} recent={section === 'overview'} />}
              {section === 'detail' && <OrderDetail order={data.orderRecords.find(order => order.orderId === orderId)} />}
            </>}</DashboardContent>
          )}
          <div className="dash-note dash-admin-note">
            <Info size={18} aria-hidden="true" />
            <p>Phiên quản trị chỉ đọc dùng bộ đơn và tồn kho minh họa riêng. Đơn mua thử của bạn nằm trong <Link className="dash-text-link" to="/orders">Đơn hàng của tôi</Link>.</p>
            <Link className="dash-text-link" to="/admin/monitoring">Mở trang giám sát <ArrowRight size={16} /></Link>
          </div>
        </div>
        </main>
      </div>
    </>
  );
}
