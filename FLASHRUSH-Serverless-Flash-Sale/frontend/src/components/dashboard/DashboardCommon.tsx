import { Ban, CircleAlert, CircleCheck, ClipboardList, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardSnapshot, OrderMetrics } from '../../types/dashboard';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { useDashboard } from './DashboardLayout';

const timeFormatter = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' });
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' });
export const formatTime = (date: string | number) => timeFormatter.format(new Date(date));
export const formatSnapshotTime = (date: string | number) => dateFormatter.format(new Date(date));

export function DashboardBrand({ cloud = false }: { cloud?: boolean }) {
  return (
    <Link className={`dash-brand ${cloud ? 'dash-brand-cloud' : ''}`} to="/admin" aria-label="FLASHRUSH · Tổng quan quản trị demo">
      <span className="dash-brand-mark"><Zap size={17} fill="currentColor" strokeWidth={0} /></span>
      FLASHRUSH <span className="dash-brand-label">{cloud ? 'Cloud Console' : 'Quản trị demo'}</span>
    </Link>
  );
}

export function MonitoringStatusBadge({ snapshot }: { snapshot?: DashboardSnapshot }) {
  const { result } = useDashboard();
  if (!snapshot) return <span className="dash-tag">{result.status === 'loading' ? 'Đang tải dữ liệu' : 'Chưa có trạng thái'}</span>;
  if (!snapshot.orders.accepted) return <span className="dash-tag">Phiên chưa có dữ liệu</span>;
  const warning = snapshot.alerts.some(alert => alert.status === 'OPEN');
  return <span className={`dash-tag ${warning ? 'dash-amber' : 'dash-green'}`}><span className="dash-dot" />{warning ? 'Cảnh báo demo' : 'Hoạt động bình thường · Demo'}</span>;
}

const metrics = [
  { key: 'accepted', admin: 'Tổng yêu cầu đặt hàng', monitoring: 'Yêu cầu đã tiếp nhận', tone: 'blue', icon: ClipboardList, label: 'HTTP 202', note: 'Yêu cầu duy nhất đã tiếp nhận' },
  { key: 'confirmed', admin: 'Đơn đã xác nhận', monitoring: 'Đơn đã xác nhận', tone: 'green', icon: CircleCheck, label: 'Thành công', note: 'Đơn đã được xác nhận' },
  { key: 'outOfStock', admin: 'Đơn hết hàng', monitoring: 'Đơn hết hàng', tone: 'amber', icon: Ban, label: 'Out of Stock', note: 'Từ chối do tồn kho không đủ' },
  { key: 'failed', admin: 'Đơn xử lý lỗi', monitoring: 'Đơn xử lý thất bại', tone: 'red', icon: CircleAlert, label: 'FAILED', note: 'Đơn có lỗi xử lý' },
] as const;

export function OrderMetricsOverview({ orders, monitoring = false }: { orders: OrderMetrics; monitoring?: boolean }) {
  return (
    <section aria-label="Tổng quan xử lý đơn hàng">
      {monitoring && <div className="dash-section-heading dash-plain-heading"><h2><ClipboardList size={18} /> Tổng quan xử lý đơn hàng</h2><span>Kịch bản mô phỏng</span></div>}
      <div className="dash-kpis">
        {metrics.map(({ key, admin, monitoring: title, tone, icon: Icon, label, note }) => (
          <article className={`dash-card dash-kpi dash-${tone}`} key={key}>
            <div className="dash-kpi-top">
              <h3>{monitoring ? title : admin}</h3>
              {monitoring ? <span className="dash-tag">{label}</span> : <span className="dash-icon"><Icon size={19} aria-hidden="true" /></span>}
            </div>
            <strong className="dash-kpi-value">{orders[key]}</strong>
            <p>{note}</p>
          </article>
        ))}
      </div>
      {(orders.pending > 0 || orders.processing > 0) && (
        <p className="dash-note dash-blue">Đơn chưa hoàn tất · <strong>{orders.pending}</strong> đang chờ xác nhận · <strong>{orders.processing}</strong> đang xử lý</p>
      )}
    </section>
  );
}

export function DashboardContent({ children }: { children: (snapshot: DashboardSnapshot) => ReactNode }) {
  const { result, refresh, setScenario } = useDashboard();
  if (result.status === 'error') {
    return <EmptyState error title="Không thể tải dữ liệu mô phỏng" description={result.message}><div className="dash-state-actions"><Button onClick={refresh}>Thử lại</Button><Button variant="secondary" onClick={() => setScenario('warning')}>Tải kịch bản mặc định</Button></div></EmptyState>;
  }
  if (result.status === 'loading') {
    return (
      <div className="dash-stack" role="status" aria-label="Đang tải dữ liệu bảng điều khiển">
        <span className="sr-only">Đang tải dữ liệu bảng điều khiển…</span>
        <div className="dash-kpis" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => <div className="skeleton dash-skeleton" key={index} />)}
        </div>
        <div className="skeleton dash-skeleton-panel" aria-hidden="true" />
        <div className="skeleton dash-skeleton-panel" aria-hidden="true" />
      </div>
    );
  }
  return children(result.snapshot);
}
