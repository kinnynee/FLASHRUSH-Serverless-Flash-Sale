import type { OrderRecord, PurchaseIntent } from '../types/order';

const INTENT = 'flashrush.mock.intent.v1';
const ORDERS = 'flashrush.mock.orders.v1';
const ACCESS = 'flashrush.mock.access.v1';
const HISTORY = 'flashrush.mock.history.v1';
function read<T>(storage: Storage, key: string, fallback: T): T { try { const value = storage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
// Writes intentionally throw if storage is unavailable: do not submit without recovery data.
export const getIntent = () => read<PurchaseIntent | null>(sessionStorage, INTENT, null);
export const saveIntent = (intent: PurchaseIntent) => sessionStorage.setItem(INTENT, JSON.stringify(intent));
export const clearIntent = () => sessionStorage.removeItem(INTENT);
export const getMockOrders = () => read<Record<string, { order: OrderRecord; key: string; outcome: PurchaseIntent['outcome']; readyAt: number }>>(sessionStorage, ORDERS, {});
export const saveMockOrders = (orders: ReturnType<typeof getMockOrders>) => sessionStorage.setItem(ORDERS, JSON.stringify(orders));
export const getAccess = () => read<Record<string, string>>(sessionStorage, ACCESS, {});
export const saveAccess = (orderId: string, key: string) => sessionStorage.setItem(ACCESS, JSON.stringify({ ...getAccess(), [orderId]: key }));
export const getHistory = () => read<OrderRecord[]>(localStorage, HISTORY, []);
export function saveHistory(order: OrderRecord) { const orders = getHistory().filter(item => item.orderId !== order.orderId); localStorage.setItem(HISTORY, JSON.stringify([order, ...orders])); }
