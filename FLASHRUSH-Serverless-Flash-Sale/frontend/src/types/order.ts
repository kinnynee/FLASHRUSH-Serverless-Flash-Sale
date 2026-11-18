export type OrderStatus = 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'OUT_OF_STOCK' | 'FAILED';
export type MockOutcome = Exclude<OrderStatus, 'PENDING' | 'PROCESSING'>;
export interface OrderItem { productId: string; name: string; image: string; quantity: number; unitPrice: number; selectedColor?: string }
export interface PurchaseIntent { key: string; item: OrderItem; outcome: MockOutcome; createdAt: number }
export interface OrderRecord { orderId: string; item: OrderItem; status: OrderStatus; createdAt: number }
export const isTerminal = (status: OrderStatus) => ['CONFIRMED', 'OUT_OF_STOCK', 'FAILED'].includes(status);
