export type OrderStatus = 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'OUT_OF_STOCK' | 'FAILED';
export type MockOutcome = Exclude<OrderStatus, 'PENDING' | 'PROCESSING'>;

export interface OrderItem {
  productId: string;
  name: string;
  image?: string;
  quantity: number;
  unitPrice?: number;
  subtotal?: number;
  selectedColor?: string;
}
export type PricedOrderItem = OrderItem & { unitPrice: number };

export interface PurchaseIntent {
  key: string;
  items: PricedOrderItem[];
  outcome?: MockOutcome;
  createdAt: number;
  source?: 'buy-now' | 'cart';
  cartAdditionIds?: string[];
}

export interface OrderRecord {
  orderId: string;
  items: OrderItem[];
  status: OrderStatus;
  totalQuantity: number;
  subtotal?: number;
  discountAmount?: number;
  totalAmount?: number;
  createdAt: number;
  updatedAt?: number;
  confirmedAt?: number;
}

export const isTerminal = (status: OrderStatus): status is MockOutcome =>
  status === 'CONFIRMED' || status === 'OUT_OF_STOCK' || status === 'FAILED';
export const isOrderStatus = (value: unknown): value is OrderStatus =>
  ['PENDING', 'PROCESSING', 'CONFIRMED', 'OUT_OF_STOCK', 'FAILED'].some(status => status === value);

export function orderPayload(items: Pick<OrderItem, 'productId' | 'quantity'>[]) {
  const quantities = new Map<string, number>();
  for (const { productId, quantity } of items) quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  return { items: [...quantities.keys()].sort().map(productId => ({ productId, quantity: quantities.get(productId)! })) };
}

export const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
