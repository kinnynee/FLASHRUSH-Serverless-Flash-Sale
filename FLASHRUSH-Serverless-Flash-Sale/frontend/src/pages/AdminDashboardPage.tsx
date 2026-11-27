import { ArrowLeft, CalendarClock, Package, ReceiptText } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { AdminTopbar } from '../components/admin/AdminTopbar';
import { AdminOrdersTable, ProductInventoryTable, RecentOrdersTable } from '../components/admin/AdminTables';
import { EmptyState } from '../components/common/EmptyState';
import { DashboardContent, formatSnapshotTime, OrderMetricsOverview } from '../components/dashboard/DashboardCommon';
import { useDashboard } from '../components/dashboard/DashboardLayout';
import { OrderStatusBadge } from '../components/order/OrderStatusBadge';
import { OrderSummary } from '../components/order/OrderSummary';
import type { OrderRecord } from '../types/order';
import { AdminCampaignManagement } from './AdminCampaignManagement';
import { AdminPageHeader, AdminRefreshButton } from '../components/admin/AdminPageHeader';

const pages = {
  overview: ['Tổng quan Flash Sale', 'Theo dõi sản phẩm, tồn kho và kết quả đặt hàng.'],
  products: ['Sản phẩm', 'Xem tồn kho của phiên Flash Sale.'],
  campaigns: ['Đợt Flash Sale', 'Tạo, chỉnh sửa lịch và sản phẩm trong các đợt Flash Sale.'],
  orders: ['Đơn hàng', 'Theo dõi yêu cầu đã tiếp nhận và trạng thái xử lý.'],
  detail: ['Chi tiết đơn hàng', 'Thông tin chi tiết của đơn hàng.'],
  missing: ['Trang quản trị không tồn tại', 'Quay về trang tổng quan quản trị.'],
} as const;

const managementLinks = [
  { to: '/admin/products', label: 'Sản phẩm', detail: 'Quản lý giá bán và tồn kho.', icon: Package },
  { to: '/admin/campaigns', label: 'Đợt Flash Sale', detail: 'Thiết lập lịch và sản phẩm sale.', icon: CalendarClock },
  { to: '/admin/orders', label: 'Đơn hàng', detail: 'Tra cứu và lọc đơn hàng.', icon: ReceiptText },
];

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
  const { result, refresh } = useDashboard();
  const [title] = pages[section];

  return (
    <>
      <AdminTopbar />
      <div className="dash-admin">
        <AdminSidebar />
        <main id="main-content" tabIndex={-1} className="dash-admin-main">
        {section !== 'campaigns' && <AdminPageHeader title={section === 'overview' ? 'Tổng quan' : title} description={pages[section][1]} actions={section === 'overview' ? <AdminRefreshButton onClick={refresh} disabled={result.status === 'loading'} /> : undefined} />}
        <div className="dash-admin-body dash-stack">
          {section === 'missing' ? (
            <EmptyState title="Không tìm thấy trang" description="Đường dẫn này không thuộc khu vực quản trị.">
              <Link className="button button-primary" to="/admin">Về tổng quan</Link>
            </EmptyState>
          ) : section === 'campaigns' ? (
            <AdminCampaignManagement />
          ) : (
            <DashboardContent>{data => <>
              {section === 'overview' && <nav className="dash-admin-shortcuts" aria-label="Quản lý trong tổng quan Admin">
                {managementLinks.map(({ to, label, detail, icon: Icon }) => <Link className="dash-card dash-admin-shortcut" to={to} key={to}>
                  <span className="dash-admin-shortcut-icon"><Icon size={20} aria-hidden="true" /></span>
                  <span><strong>{label}</strong><small>{detail}</small></span>
                  <span className="dash-admin-shortcut-arrow" aria-hidden="true">→</span>
                </Link>)}
              </nav>}
              {section === 'overview' && <OrderMetricsOverview orders={data.orders} revenue={data.totalRevenue} successRate={data.successRate} />}
              {section === 'products' && <ProductInventoryTable products={data.products} onRefresh={refresh} />}
              {section === 'overview' && <ProductInventoryTable products={data.products} onRefresh={refresh} />}
              {section === 'overview' && <RecentOrdersTable orders={data.orderRecords} recent />}
              {section === 'orders' && <AdminOrdersTable />}
              {section === 'detail' && <OrderDetail order={data.orderRecords.find(order => order.orderId === orderId)} />}
            </>}</DashboardContent>
          )}
        </div>
        </main>
      </div>
    </>
  );
}
