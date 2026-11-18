import { Check, LoaderCircle, ShoppingCart, TriangleAlert } from 'lucide-react';
import type { OrderStatus } from '../../types/order';
export function OrderStatusIcon({ status }: { status: OrderStatus }) {
  const Icon = status === 'CONFIRMED' ? Check : status === 'OUT_OF_STOCK' ? ShoppingCart : status === 'FAILED' ? TriangleAlert : LoaderCircle;
  const style = status === 'CONFIRMED' ? 'success' : status === 'OUT_OF_STOCK' ? 'stock' : status === 'FAILED' ? 'failure' : 'pending';
  return <div className={`order-icon ${style}`} aria-hidden="true"><Icon size={32} /></div>;
}
