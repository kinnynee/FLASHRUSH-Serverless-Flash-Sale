import type { OrderService } from './orderService';
import { isMoney, isOrderStatus, orderPayload, type OrderItem, type OrderRecord } from '../types/order';
import { totalQuantity } from './cartStorage';

const messages: Record<string, string> = {
  INVALID_REQUEST: 'Yêu cầu không hợp lệ.',
  ORDER_TOO_LARGE: 'Đơn hàng vượt quá kích thước cho phép.',
  PRODUCT_NOT_FOUND: 'Có sản phẩm không còn trong danh mục.',
  CAMPAIGN_NOT_ACTIVE: 'Có sản phẩm không còn thuộc chiến dịch đang diễn ra.',
  CAMPAIGN_QUANTITY_LIMIT: 'Có sản phẩm vượt giới hạn số lượng của chiến dịch.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn hoặc phiên này không có quyền truy cập.',
  IDEMPOTENCY_PAYLOAD_CONFLICT: 'Khóa yêu cầu đã được dùng với lựa chọn khác.',
};
const rejected = new Set(['INVALID_REQUEST', 'ORDER_TOO_LARGE', 'PRODUCT_NOT_FOUND', 'CAMPAIGN_NOT_ACTIVE', 'CAMPAIGN_QUANTITY_LIMIT']);

export class OrderApiError extends Error {
  constructor(public status: number, public code: string, public definitelyRejected: boolean) {
    super(messages[code] || (status === 429 ? 'Quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.' :
      'Chưa thể xác định kết quả. Hãy thử lại cùng yêu cầu.'));
  }
}

async function request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('Chưa cấu hình địa chỉ API.');
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { ...init, signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: { code?: string; retryable?: boolean } } | undefined;
    const code = body?.error?.code ?? '';
    throw new OrderApiError(response.status, code, init.method === 'POST' &&
      [400, 404, 409].includes(response.status) && body?.error?.retryable === false && rejected.has(code));
  }
  if (![200, 202].includes(response.status)) throw new Error('Phản hồi API chưa hợp lệ.');
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Phản hồi API không hợp lệ.');
  return data as Record<string, unknown>;
}

function readItem(value: unknown, previews: OrderItem[]): OrderItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dòng đơn hàng không hợp lệ.');
  const item = value as Record<string, unknown>;
  const { productId, quantity } = item;
  if (typeof productId !== 'string' || !productId || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error('Dòng đơn hàng không hợp lệ.');
  }
  const preview = previews.find(line => line.productId === productId);
  return {
    productId, quantity,
    name: typeof item.name === 'string' ? item.name : preview?.name ?? productId,
    image: typeof item.image === 'string' ? item.image : preview?.image,
    unitPrice: isMoney(item.unitPrice) ? item.unitPrice : undefined,
    subtotal: isMoney(item.subtotal) ? item.subtotal : undefined,
    selectedColor: preview?.selectedColor,
  };
}

function timestamp(value: unknown) {
  const stamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(stamp) ? stamp : undefined;
}

function parseOrder(data: Record<string, unknown>, previews: OrderItem[] = [], fallbackTime?: number): OrderRecord {
  const { orderId, status } = data;
  const createdAt = timestamp(data.createdAt) ?? timestamp(data.updatedAt) ?? fallbackTime;
  if (typeof orderId !== 'string' || !orderId || !isOrderStatus(status) || createdAt === undefined) {
    throw new Error('Phản hồi trạng thái không hợp lệ.');
  }
  const raw = data.items === undefined ? [data] : data.items;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Danh sách sản phẩm của đơn không hợp lệ.');
  const items = raw.map(item => readItem(item, previews));
  const quantity = totalQuantity(items);
  if (!Number.isSafeInteger(quantity) || items.length !== new Set(items.map(item => item.productId)).size ||
      (data.totalQuantity !== undefined && data.totalQuantity !== quantity)) throw new Error('Tổng số lượng không hợp lệ.');
  return {
    orderId, status, items, totalQuantity: quantity, createdAt,
    subtotal: isMoney(data.subtotal) ? data.subtotal : undefined,
    discountAmount: isMoney(data.discountAmount) ? data.discountAmount : undefined,
    totalAmount: isMoney(data.totalAmount) ? data.totalAmount : undefined,
    updatedAt: timestamp(data.updatedAt), confirmedAt: timestamp(data.confirmedAt),
  };
}

export const httpOrderService: OrderService = {
  async submit(intent) {
    const body = JSON.stringify(orderPayload(intent.items));
    const data = await request('/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': intent.key }, body,
    });
    const order = parseOrder(data, intent.items, intent.createdAt);
    if (JSON.stringify(orderPayload(order.items)) !== body) throw new Error('Đơn hàng trả về không khớp yêu cầu.');
    return order;
  },
  async getOrder(orderId, key) {
    const data = await request(`/orders/${encodeURIComponent(orderId)}`, { headers: { 'X-Order-Token': key } });
    const order = parseOrder(data);
    if (order.orderId !== orderId) throw new Error('Mã đơn hàng trả về không khớp yêu cầu.');
    return order;
  },
};
