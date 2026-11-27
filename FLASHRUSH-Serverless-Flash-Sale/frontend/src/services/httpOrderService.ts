import type { OrderService } from './orderService';
import type { OrderRecord, OrderStatus } from '../types/order';
import type { OrderItem } from '../types/order';

const statuses: OrderStatus[] = ['PENDING', 'PROCESSING', 'CONFIRMED', 'OUT_OF_STOCK', 'FAILED'];
export class OrderApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request(path: string, init: RequestInit) {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('Chưa cấu hình địa chỉ API.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as { error?: { code?: string } } | undefined;
      if (body?.error?.code?.startsWith('SALE_')) throw new OrderApiError(response.status, body.error.code);
      const messages: Record<number, string> = { 400: 'Yêu cầu không hợp lệ.', 403: 'Không có quyền tra cứu đơn.', 404: 'Không tìm thấy đơn hoặc sản phẩm.', 409: 'Khóa yêu cầu đã được dùng với lựa chọn khác.', 429: 'Quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.' };
      throw new OrderApiError(response.status, messages[response.status] || 'Chưa thể xác định kết quả. Hãy thử lại cùng yêu cầu.');
    }
    if (![200, 202].includes(response.status)) throw new Error('Phản hồi API chưa hợp lệ.');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Phản hồi API không hợp lệ.');
    return data as Record<string, unknown>;
  } finally { clearTimeout(timer); }
}
function identity(data: Record<string, unknown>) {
  if (typeof data.orderId !== 'string' || !statuses.includes(data.status as OrderStatus)) throw new Error('Phản hồi trạng thái không hợp lệ.');
  return { orderId: data.orderId, status: data.status as OrderStatus };
}
function snapshot(data: Record<string, unknown>, productId: string, quantity: number): OrderItem {
  const item = data.item && typeof data.item === 'object' ? data.item as Record<string, unknown> : {};
  const rawPrice = data.unitPrice ?? item.unitPrice;
  const price = typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : null;
  const discount = typeof data.discount === 'number' ? data.discount : typeof item.discountAmount === 'number' ? item.discountAmount : 0;
  const rawTotal = Object.hasOwn(data, 'totalAmount') ? data.totalAmount : item.totalAmount;
  const total = rawTotal === null ? null : typeof rawTotal === 'number' ? rawTotal : price === null ? null : price * quantity - discount;
  return { productId, quantity, name: typeof item.name === 'string' ? item.name : productId,
    image: typeof item.image === 'string' ? item.image : '', unitPrice: price, totalAmount: total,
    selectedColor: typeof item.selectedColor === 'string' ? item.selectedColor : undefined,
    discountAmount: discount, voucherCode: typeof item.voucherCode === 'string' ? item.voucherCode : undefined };
}
export const httpOrderService: OrderService = {
  async submit(intent) {
    const data = await request('/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': intent.key }, body: JSON.stringify({ productId: intent.item.productId, quantity: intent.item.quantity, ...(intent.item.selectedColor ? { selectedColor: intent.item.selectedColor } : {}) }) });
    return { ...identity(data), item: snapshot(data, intent.item.productId, intent.item.quantity), createdAt: Date.parse(String(data.createdAt)) || intent.createdAt };
  },
  async getOrder(orderId, key): Promise<OrderRecord> {
    const data = await request(`/orders/${encodeURIComponent(orderId)}`, { headers: { 'X-Order-Token': key } });
    const id = identity(data);
    if (id.orderId !== orderId || typeof data.productId !== 'string' || !Number.isInteger(data.quantity) || Number(data.quantity) < 1) throw new Error('Dữ liệu đơn không hợp lệ.');
    return { ...id, item: snapshot(data, data.productId, Number(data.quantity)), createdAt: Date.parse(String(data.createdAt || data.updatedAt)) || Date.now() };
  },
};
