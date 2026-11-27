import type { OrderItem } from '../types/order';
import { formatPrice } from './product';

export function orderTotal(item: OrderItem): number | null {
  if (item.totalAmount !== undefined) return item.totalAmount;
  return item.unitPrice === null ? null : item.unitPrice * item.quantity - (item.discountAmount || 0);
}
export const displayOrderPrice = (value: number | null) => value === null ? 'Không có dữ liệu giá' : formatPrice(value);
