import { Link } from 'react-router-dom';
import type { DashboardProduct } from '../../types/dashboard';
import type { OrderRecord } from '../../types/order';
import { formatPrice } from '../../utils/product';
import { EmptyState } from '../common/EmptyState';
import { ProductImage } from '../common/ProductImage';
import { OrderStatusBadge } from '../order/OrderStatusBadge';
import { formatTime } from '../dashboard/DashboardCommon';

export function ProductInventoryTable({ products }: { products: DashboardProduct[] }) {
  return (
    <section className="dash-card dash-table-card" aria-labelledby="dash-products">
      <div className="dash-section-heading">
        <div><h2 id="dash-products">Sản phẩm Flash Sale</h2><p>Tồn kho của các mặt hàng trong phiên mô phỏng</p></div>
        <span>{products.length} mặt hàng</span>
      </div>
      {products.length === 0 ? (
        <EmptyState title="Chưa có sản phẩm" description="Phiên mô phỏng hiện tại chưa có mặt hàng." />
      ) : (
        <div className="dash-scroll-table" role="region" aria-labelledby="dash-products" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Hình ảnh</th><th scope="col">Tên sản phẩm</th><th scope="col">Mã sản phẩm</th><th scope="col">Giá bán (VND)</th><th scope="col">Tồn ban đầu</th><th scope="col">Tồn hiện tại</th><th scope="col">Trạng thái</th></tr></thead>
            <tbody>
              {products.map(product => (
                <tr key={product.productId}>
                  <td><ProductImage className="dash-product-image" src={product.images[0]} alt="" /></td>
                  <th scope="row">{product.name}<small>{product.category}</small></th>
                  <td className="dash-code">{product.productId}</td>
                  <td className="dash-price">{formatPrice(product.price)}</td>
                  <td className="dash-stock">{product.initialStock}</td>
                  <td className="dash-stock">
                    <strong>{product.stock}</strong>
                    <progress max={product.initialStock || 1} value={product.stock} aria-label={`Tồn kho ${product.name}`} />
                  </td>
                  <td><span className={`dash-tag ${product.stock > 0 ? 'dash-green' : 'dash-amber'}`}>{product.stock > 0 ? 'Còn hàng' : 'Hết hàng'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RecentOrdersTable({ orders, recent = false }: { orders: OrderRecord[]; recent?: boolean }) {
  const shown = recent ? orders.slice(0, 5) : orders;
  return (
    <section className="dash-card dash-table-card" aria-labelledby="dash-orders">
      <div className="dash-section-heading">
        <div><h2 id="dash-orders">{recent ? 'Đơn hàng gần đây' : 'Đơn hàng Flash Sale'}</h2><p>Các yêu cầu đặt hàng trong phiên mô phỏng</p></div>
        {recent && orders.length > shown.length && <Link className="dash-text-link" to="/admin/orders">Xem tất cả {orders.length} đơn</Link>}
      </div>
      {shown.length === 0 ? (
        <EmptyState title="Chưa có đơn hàng" description="Phiên mô phỏng hiện tại chưa ghi nhận yêu cầu đặt hàng." />
      ) : (
        <div className="dash-scroll-table" role="region" aria-labelledby="dash-orders" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Mã đơn hàng</th><th scope="col">Sản phẩm</th><th scope="col">Số lượng</th><th scope="col">Thời gian tạo</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
            <tbody>
              {shown.map(order => (
                <tr key={order.orderId}>
                  <th className="dash-code" scope="row">#{order.orderId}</th>
                  <td>{order.item.name}</td>
                  <td>{order.item.quantity} sp</td>
                  <td><time dateTime={new Date(order.createdAt).toISOString()}>{formatTime(order.createdAt)}</time></td>
                  <td><OrderStatusBadge status={order.status} /></td>
                  <td><Link className="dash-detail-link" to={`/admin/orders/${encodeURIComponent(order.orderId)}`} aria-label={`Xem chi tiết đơn ${order.orderId}`}>Xem chi tiết</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
