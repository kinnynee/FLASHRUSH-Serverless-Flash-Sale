import { accessToken, clearCustomerSession } from './customerAuth';
import type { Product } from '../types/product';
import type { OrderStatus, OrderItem } from '../types/order';

export type Address = { id: string; name: string; phone: string; street: string; ward: string; city: string };
export type Profile = { name: string; email: string; phone: string; avatar: string; addresses: Address[]; defaultAddressId: string; version: number };
export type CartInput = { productId: string; quantity: number; color: string; unitPrice: number };
export type CartLine = CartInput & { lineId: string; product: Product | null; issue: string | null; priceChanged: boolean };
export type Cart = { version: number; items: CartLine[] };
export type CustomerOrder = { orderId: string; checkoutId: string; status: OrderStatus; item: OrderItem; address: Address; createdAt: string; updatedAt: string; failureReason?: string };
export type Checkout = { checkoutId: string; status: OrderStatus; orders: CustomerOrder[] };
export type CheckoutInput = { version: number; lineIds: string[]; addressId: string };
export class CustomerApiError extends Error {
  constructor(public code: string, public status: number) { super(customerMessage(code)); }
}
export function customerMessage(code: string) {
  const messages: Record<string, string> = {
    UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    VERSION_CONFLICT: 'Dữ liệu đã thay đổi ở phiên khác. Hãy tải lại trước khi tiếp tục.',
    PRICE_CHANGED: 'Giá đã thay đổi. Hãy cập nhật giá trong giỏ hàng trước khi mua.',
    SALE_SOLD_OUT: 'Số lượng còn lại không đủ. Vui lòng điều chỉnh giỏ hàng.',
    SALE_ENDED: 'Đợt Flash Sale đã kết thúc hoặc chưa mở bán.',
    SALE_NOT_ACTIVE: 'Đợt Flash Sale chưa mở bán.',
    CAMPAIGN_QUANTITY_LIMIT: 'Số lượng vượt giới hạn của đợt Flash Sale.',
    ADDRESS_REQUIRED: 'Vui lòng thêm và chọn địa chỉ nhận hàng.',
    PRODUCT_NOT_FOUND: 'Sản phẩm không còn tồn tại.',
    CUSTOMER_NOT_CONFIGURED: 'Dịch vụ tài khoản chưa được triển khai.',
    ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng trong tài khoản này.',
    CHECKOUT_NOT_FOUND: 'Không tìm thấy yêu cầu mua hàng trong tài khoản này.',
    VARIANT_CHANGED: 'Phân loại sản phẩm đã thay đổi.',
    INVALID_PHONE: 'Số điện thoại cần có 8–20 chữ số, có thể bắt đầu bằng +.',
    INVALID_AVATAR_URL: 'Ảnh đại diện cần dùng đường dẫn HTTPS.',
  };
  return messages[code] || 'Không thể thực hiện yêu cầu. Vui lòng kiểm tra dữ liệu và thử lại.';
}
async function request<T>(path: string, method = 'GET', body?: unknown, key?: string): Promise<T> {
  const token = await accessToken();
  const result = await fetch(`${String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  const data = await result.json().catch(() => null);
  if (!result.ok) {
    if (result.status === 401) clearCustomerSession();
    throw new CustomerApiError(data?.error?.code || 'SERVICE_UNAVAILABLE', result.status);
  }
  if (!data || typeof data !== 'object') throw new Error('Phản hồi dịch vụ không hợp lệ.');
  return data as T;
}
export const customerService = {
  profile: () => request<Profile>('/me/profile'),
  saveProfile: ({ email: _email, ...profile }: Profile) => request<Profile>('/me/profile', 'PUT', profile),
  cart: () => request<Cart>('/me/cart'),
  saveCart: (version: number, items: CartInput[]) => request<Cart>('/me/cart', 'PUT', { version, items: items.map(({ productId, quantity, color, unitPrice }) => ({ productId, quantity, color, unitPrice })) }),
  checkout: (body: CheckoutInput, key: string) => request<Checkout>('/me/checkouts', 'POST', body, key),
  checkoutStatus: (id: string) => request<Checkout>(`/me/checkouts/${encodeURIComponent(id)}`),
  orders: (cursor?: string) => request<{ items: CustomerOrder[]; nextCursor: string | null }>(`/me/orders${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`),
  order: (id: string) => request<CustomerOrder>(`/me/orders/${encodeURIComponent(id)}`),
};
