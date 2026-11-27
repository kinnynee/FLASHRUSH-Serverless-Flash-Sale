export type OrderStatus = 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'OUT_OF_STOCK' | 'FAILED';
export type MockOutcome = Exclude<OrderStatus, 'PENDING' | 'PROCESSING'>;
export interface OrderItem { productId: string; name: string; image: string; quantity: number; unitPrice: number | null; selectedColor?: string; discountAmount?: number; totalAmount?: number | null; voucherCode?: string }
export interface PurchaseIntent { key: string; item: OrderItem & { unitPrice: number }; outcome: MockOutcome; createdAt: number }
export interface OrderRecord { totalAmount?: number; discount?: number; voucherCode?: string; orderId: string; item: OrderItem; status: OrderStatus; createdAt: number }
export const isTerminal = (status: OrderStatus) => ['CONFIRMED', 'OUT_OF_STOCK', 'FAILED'].includes(status);
