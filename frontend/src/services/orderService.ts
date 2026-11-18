import type { OrderRecord, PurchaseIntent } from '../types/order';
import { mockOrderService } from './mockOrderService';
export interface OrderService { submit(intent: PurchaseIntent): Promise<OrderRecord>; getOrder(orderId: string, key: string): Promise<OrderRecord> }
// Explicitly a browser-only simulation; no production adapter or HTTP request.
export const orderService: OrderService = mockOrderService;
