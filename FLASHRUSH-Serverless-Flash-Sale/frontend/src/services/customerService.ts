import { accessToken, clearCustomerSession } from './customerAuth';
import type { Product } from '../types/product';
import type { OrderStatus, OrderItem } from '../types/order';

export type Address = { id: string; name: string; phone: string; street: string; ward: string; city: string };
export type Profile = { name: string; email: string; phone: string; avatar: string; addresses: Address[]; defaultAddressId: string; version: number };
export type CartInput = { productId: string; quantity: number; color: string; unitPrice: number };
export type CartLine = CartInput & { lineId: string; product: Product | null; issue: string | null; priceChanged: boolean };
export type Cart = { version: number; items: CartLine[] };
export type CustomerOrder = { orderId: string; checkoutId: string; status: OrderStatus; item: OrderItem; address: Address; createdAt: string; updatedAt: string; failureReason?: string; subtotal?:number; discount?:number; totalAmount?:number; voucherCode?:string };
export type Pricing = { subtotal: number; discount: number; shippingFee: number; total: number; voucherCode: string; shippingMethod: string; paymentMethod: string; quantity: number };
export type CheckoutOptions = { shipping: { id: string; name: string; fee: number }[]; payments: { id: string; name: string }[]; voucher: { code: string; minimum: number; basisPoints: number } };
export type QuoteInput = { version: number; lineIds: string[]; voucherCode?: string; shippingMethod?: string; paymentMethod?: string };
export type Checkout = { checkoutId: string; status: OrderStatus; orders: CustomerOrder[]; pricing?: Pricing };
export type CheckoutInput = QuoteInput & { addressId: string; expectedTotal?: number };
export class CustomerApiError extends Error {
  constructor(public code: string, public status: number) { super(customerMessage(code)); }
}
export function customerMessage(code: string) {
  const messages: Record<string, string> = {
    VOUCHER_UNAVAILABLE: 'Voucher không tồn tại, đã tắt hoặc hết thời hạn.',
    VOUCHER_EXHAUSTED: 'Voucher đã hết lượt sử dụng.',
    VOUCHER_ALREADY_USED: 'Bạn đã sử dụng voucher này.',
    VOUCHER_MIN_SPEND: 'Đơn hàng chưa đạt giá trị tối thiểu của voucher.',
    VOUCHER_CHANGED: 'Voucher đã thay đổi. Vui lòng áp dụng lại.',
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
    INVALID_VOUCHER: 'Mã giảm giá không hợp lệ.',
    VOUCHER_MINIMUM_NOT_MET: 'HAUMON áp dụng khi tiền sản phẩm được chọn đạt từ 3.600.000đ.',
    QUOTE_CHANGED: 'Tổng thanh toán đã thay đổi. Vui lòng xem lại báo giá trước khi đặt hàng.',
    QUOTE_REQUIRED: 'Vui lòng tải báo giá trước khi đặt hàng.',
    INVALID_SHIPPING_METHOD: 'Phương thức vận chuyển không được hỗ trợ.',
    INVALID_PAYMENT_METHOD: 'Phương thức thanh toán không được hỗ trợ.',
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
  voucherQuote: (code:string,lineIds:string[]) => request<{code:string;subtotal:number;discount:number;total:number}>('/me/vouchers/quote','POST',{code,lineIds}),
  checkoutOptions: () => request<CheckoutOptions>('/me/checkout-quote'),
  quote: (body: QuoteInput) => request<Pricing>('/me/checkout-quote', 'POST', body),
  profile: () => request<Profile>('/me/profile'),
  saveProfile: ({ email: _email, ...profile }: Profile) => request<Profile>('/me/profile', 'PUT', profile),
  cart: () => request<Cart>('/me/cart'),
  saveCart: (version: number, items: CartInput[]) => request<Cart>('/me/cart', 'PUT', { version, items: items.map(({ productId, quantity, color, unitPrice }) => ({ productId, quantity, color, unitPrice })) }),
  checkout: (body: CheckoutInput, key: string) => request<Checkout>('/me/checkouts', 'POST', body, key),
  checkoutStatus: (id: string) => request<Checkout>(`/me/checkouts/${encodeURIComponent(id)}`),
  orders: (cursor?: string) => request<{ items: CustomerOrder[]; nextCursor: string | null }>(`/me/orders${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`),
  order: (id: string) => request<CustomerOrder>(`/me/orders/${encodeURIComponent(id)}`),
};
