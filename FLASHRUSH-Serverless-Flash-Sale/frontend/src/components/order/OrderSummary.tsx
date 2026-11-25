import { ProductImage } from '../common/ProductImage';
import { formatPrice } from '../../utils/product';
import type { OrderItem, OrderRecord } from '../../types/order';

type Summary = Pick<OrderRecord, 'items' | 'totalQuantity' | 'totalAmount' | 'discountAmount'> &
  Partial<Pick<OrderRecord, 'orderId' | 'createdAt' | 'confirmedAt'>>;

export function OrderItems({ items }: { items: OrderItem[] }) {
  return <ul className="order-lines">
      {items.map(item => <li className="order-product" key={item.productId}>
        {item.image && <ProductImage src={item.image} alt="" />}
        <div>
          <strong>{item.name}</strong>
          {item.selectedColor && <p>Màu {item.selectedColor}</p>}
          <p>Số lượng {item.quantity} · Đơn giá {item.unitPrice === undefined ? 'chưa có dữ liệu' : formatPrice(item.unitPrice)}</p>
          {item.subtotal !== undefined && <p>Thành tiền {formatPrice(item.subtotal)}</p>}
        </div>
      </li>)}
    </ul>;
}

export function OrderSummary({ items, orderId, totalQuantity, totalAmount, discountAmount, createdAt, confirmedAt }: Summary) {
  return <div className="order-summary">
    {orderId && <div className="order-summary-head"><span>Mã đơn hàng</span><strong>{orderId}</strong></div>}
    {createdAt !== undefined && <div className="order-summary-head"><span>Đã tạo</span><time>{new Date(createdAt).toLocaleString('vi-VN')}</time></div>}
    {confirmedAt !== undefined && <div className="order-summary-head"><span>Đã xác nhận</span><time>{new Date(confirmedAt).toLocaleString('vi-VN')}</time></div>}
    <OrderItems items={items} />
    <div className="order-summary-head"><span>Tổng số lượng</span><strong>{totalQuantity}</strong></div>
    {!!discountAmount && <div className="order-summary-head"><span>Giảm giá</span><strong>{formatPrice(discountAmount)}</strong></div>}
    <div className="order-summary-head"><span>Tổng giá trị</span>
      <strong className="order-price">{totalAmount === undefined ? 'Chưa có dữ liệu giá' : formatPrice(totalAmount)}</strong>
    </div>
  </div>;
}
