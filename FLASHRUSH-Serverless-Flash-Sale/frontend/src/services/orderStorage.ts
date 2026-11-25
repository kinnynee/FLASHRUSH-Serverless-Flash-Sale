import { isMoney, isOrderStatus, isTerminal, type MockOutcome, type OrderItem, type OrderRecord, type PurchaseIntent } from '../types/order';
import { removePurchasedAdditions, totalQuantity } from './cartStorage';

const INTENT = 'flashrush.mock.intent.v1';
const ORDERS = 'flashrush.mock.orders.v1';
const ACCESS = 'flashrush.mock.access.v1';
const HISTORY = 'flashrush.mock.history.v1';
const CART_CHECKOUTS = 'flashrush.cart.checkouts.v1';

function read(key: string, persistent = false): unknown {
  try {
    const value = (persistent ? localStorage : sessionStorage).getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch { return undefined; }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function lines(record: Record<string, unknown>, includePricing: boolean): OrderItem[] {
  const stored = Array.isArray(record.items) ? record.items : [record.item];
  return stored.flatMap(value => {
    const item = object(value);
    if (typeof item.productId !== 'string' || !item.productId || !Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1) return [];
    const quantity = Number(item.quantity);
    const unitPrice = includePricing && isMoney(item.unitPrice) ? item.unitPrice : undefined;
    const subtotal = unitPrice === undefined ? undefined : item.subtotal ?? unitPrice * quantity;
    return [{
      productId: item.productId, name: typeof item.name === 'string' ? item.name : item.productId,
      image: typeof item.image === 'string' ? item.image : undefined, quantity, unitPrice,
      subtotal: isMoney(subtotal) ? subtotal : undefined,
      selectedColor: typeof item.selectedColor === 'string' ? item.selectedColor : undefined,
    }];
  });
}

export function getIntent(): PurchaseIntent | null {
  const record = object(read(INTENT));
  const priced = lines(record, true).flatMap(item => item.unitPrice !== undefined ? [{ ...item, unitPrice: item.unitPrice }] : []);
  const { key, outcome, createdAt, source, cartAdditionIds } = record;
  const expectedLength = Array.isArray(record.items) ? record.items.length : 1;
  if (typeof key !== 'string' || !key ||
      typeof createdAt !== 'number' || !Number.isFinite(createdAt) || !priced.length || priced.length !== expectedLength) return null;
  return {
    key, items: priced, createdAt,
    ...(isOrderStatus(outcome) && isTerminal(outcome) ? { outcome } : {}),
    source: source === 'cart' || source === 'buy-now' ? source : undefined,
    cartAdditionIds: Array.isArray(cartAdditionIds) ? cartAdditionIds.filter(id => typeof id === 'string') : undefined,
  };
}

export function saveIntent(intent: PurchaseIntent) {
  if (getIntent()) throw new Error('Bạn đang có yêu cầu đặt hàng cần xử lý.');
  sessionStorage.setItem(INTENT, JSON.stringify(intent));
}
export function clearIntent(key: string) {
  if (getIntent()?.key === key) sessionStorage.removeItem(INTENT);
}

function storedOrder(value: unknown): OrderRecord | undefined {
  const record = object(value);
  const { orderId, status, createdAt } = record;
  if (typeof orderId !== 'string' || !isOrderStatus(status) || typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return;
  // Legacy HTTP entries displayed the current catalog price. Only legacy mock prices were snapshots.
  const legacyMock = !Array.isArray(record.items) && orderId.startsWith('demo-');
  const items = lines(record, Array.isArray(record.items) || legacyMock);
  if (!items.length) return;
  const subtotal = isMoney(record.subtotal) ? record.subtotal : legacyMock ? items[0].subtotal : undefined;
  return {
    orderId, items, status, createdAt, totalQuantity: totalQuantity(items), subtotal,
    discountAmount: isMoney(record.discountAmount) ? record.discountAmount : legacyMock ? 0 : undefined,
    totalAmount: isMoney(record.totalAmount) ? record.totalAmount : legacyMock ? subtotal : undefined,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : undefined,
    confirmedAt: typeof record.confirmedAt === 'number' ? record.confirmedAt : undefined,
  };
}

interface MockEntry { order: OrderRecord; key: string; outcome: MockOutcome; readyAt: number }
export function getMockOrders(): Record<string, MockEntry> {
  const entries = Object.entries(object(read(ORDERS))).flatMap(([id, value]) => {
    const { order: raw, key, outcome, readyAt } = object(value);
    const order = storedOrder(raw);
    return order && typeof key === 'string' && isOrderStatus(outcome) && isTerminal(outcome) && typeof readyAt === 'number'
      ? [[id, { order, key, outcome, readyAt }] as const] : [];
  });
  return Object.fromEntries(entries);
}
export const saveMockOrders = (orders: Record<string, MockEntry>) => sessionStorage.setItem(ORDERS, JSON.stringify(orders));
export const getAccess = (): Record<string, string> =>
  Object.fromEntries(Object.entries(object(read(ACCESS))).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
export const saveAccess = (orderId: string, key: string) =>
  sessionStorage.setItem(ACCESS, JSON.stringify({ ...getAccess(), [orderId]: key }));

export function getHistory(): OrderRecord[] {
  const stored = read(HISTORY, true);
  return Array.isArray(stored) ? stored.flatMap(entry => {
    const order = storedOrder(entry);
    return order ? [order] : [];
  }) : [];
}

export function rememberCartCheckout(orderId: string, intent: PurchaseIntent) {
  if (intent.source !== 'cart' || !intent.cartAdditionIds?.length) return;
  const checkouts = object(read(CART_CHECKOUTS));
  sessionStorage.setItem(CART_CHECKOUTS, JSON.stringify({ ...checkouts, [orderId]: intent.cartAdditionIds }));
}

export function saveHistory(order: OrderRecord) {
  const orders = getHistory();
  const previous = orders.find(item => item.orderId === order.orderId);
  if (previous && isTerminal(previous.status) && !isTerminal(order.status)) return previous;
  const items = order.items.map(item => {
    const earlier = previous?.items.find(line => line.productId === item.productId);
    return {
      ...item,
      name: item.name === item.productId ? earlier?.name ?? item.name : item.name,
      image: item.image ?? earlier?.image,
      selectedColor: item.selectedColor ?? earlier?.selectedColor,
    };
  });
  const saved = { ...order, items };
  localStorage.setItem(HISTORY, JSON.stringify([saved, ...orders.filter(item => item.orderId !== order.orderId)]));
  return saved;
}

export function settleCartCheckout(order: OrderRecord) {
  if (!isTerminal(order.status)) return;
  const checkouts = object(read(CART_CHECKOUTS));
  const additions = checkouts[order.orderId];
  if (!Array.isArray(additions)) return;
  if (order.status === 'CONFIRMED') removePurchasedAdditions(additions.filter(id => typeof id === 'string'));
  delete checkouts[order.orderId];
  sessionStorage.setItem(CART_CHECKOUTS, JSON.stringify(checkouts));
}
