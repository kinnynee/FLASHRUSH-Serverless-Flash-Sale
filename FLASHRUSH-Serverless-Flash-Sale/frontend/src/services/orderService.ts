import type { OrderRecord, PurchaseIntent } from '../types/order';
import { mockOrderService } from './mockOrderService';
import { httpOrderService } from './httpOrderService';
export interface OrderService { submit(intent: PurchaseIntent): Promise<OrderRecord>; getOrder(orderId: string, key: string): Promise<OrderRecord> }
// Explicitly a browser-only simulation; no production adapter or HTTP request.
export const isMockMode = import.meta.env.VITE_ORDER_MODE !== 'http';
export const orderService: OrderService = isMockMode ? mockOrderService : httpOrderService;
