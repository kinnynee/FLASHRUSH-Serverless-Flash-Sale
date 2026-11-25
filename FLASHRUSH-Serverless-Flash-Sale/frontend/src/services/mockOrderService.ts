import type { OrderService } from './orderService';
import { isTerminal, orderPayload, type OrderRecord } from '../types/order';
import { getMockOrders, saveMockOrders } from './orderStorage';

export const mockOrderService: OrderService = {
  async submit(intent) {
    const orders = getMockOrders();
    const payload = orderPayload(intent.items);
    const outcome = intent.outcome ?? 'CONFIRMED';
    const existing = Object.values(orders).find(entry => entry.key === intent.key);
    if (existing) {
      if (JSON.stringify(orderPayload(existing.order.items)) !== JSON.stringify(payload) || existing.outcome !== outcome) {
        throw new Error('Yêu cầu đã lưu có nội dung khác với đơn đang xử lý.');
      }
      return existing.order;
    }
    const items = payload.items.map(line => {
      const item = intent.items.find(item => item.productId === line.productId)!;
      return { ...item, quantity: line.quantity, subtotal: item.unitPrice * line.quantity };
    });
    const createdAt = Date.now();
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const order: OrderRecord = {
      orderId: `demo-${crypto.randomUUID()}`, items, status: 'PENDING', createdAt, updatedAt: createdAt,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0), subtotal, discountAmount: 0, totalAmount: subtotal,
    };
    orders[order.orderId] = { order, key: intent.key, outcome, readyAt: createdAt + 6000 };
    saveMockOrders(orders);
    return order;
  },
  async getOrder(orderId, key) {
    if (import.meta.env.DEV && sessionStorage.getItem('flashrush.demo.networkError') === 'true') {
      throw new Error('Lỗi kết nối mạng.');
    }
    const orders = getMockOrders();
    const entry = orders[orderId];
    if (!entry || entry.key !== key) throw new Error('Không thể truy cập trạng thái đơn trong phiên này.');
    if (!isTerminal(entry.order.status) && Date.now() >= entry.readyAt) {
      const timestamp = Date.now();
      entry.order = {
        ...entry.order, status: entry.outcome, updatedAt: timestamp,
        confirmedAt: entry.outcome === 'CONFIRMED' ? timestamp : undefined,
      };
      saveMockOrders(orders);
    }
    return entry.order;
  },
};
