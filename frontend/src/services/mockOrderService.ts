import type { OrderService } from './orderService';
import { getMockOrders, saveMockOrders } from './orderStorage';

export const mockOrderService: OrderService = {
  async submit(intent) {
    const orders = getMockOrders();
    const existing = Object.values(orders).find(entry => entry.key === intent.key);
    if (existing) {
      if (JSON.stringify(existing.order.item) !== JSON.stringify(intent.item) || existing.outcome !== intent.outcome) throw new Error('Intent không khớp với yêu cầu đã gửi.');
      return existing.order;
    }
    const order = { orderId: `demo-${crypto.randomUUID()}`, item: intent.item, status: 'PENDING' as const, createdAt: Date.now() };
    orders[order.orderId] = { order, key: intent.key, outcome: intent.outcome, readyAt: Date.now() + 6000 };
    saveMockOrders(orders);
    return order;
  },
  async getOrder(orderId, key) {
    const orders = getMockOrders();
    const entry = orders[orderId];
    if (!entry || entry.key !== key) throw new Error('Không thể truy cập trạng thái đơn trong phiên này.');
    if (entry.order.status === 'PENDING' && Date.now() >= entry.readyAt) { entry.order.status = entry.outcome; saveMockOrders(orders); }
    return { ...entry.order };
  },
};
