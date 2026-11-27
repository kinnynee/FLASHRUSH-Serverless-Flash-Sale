import type { AdminOrdersPage, DashboardSnapshot } from '../types/dashboard';
import type { OrderRecord } from '../types/order';
import type { Product } from '../types/product';
import { adminHeaders } from './adminAuth';
import { staffSessionVersion, clearStaffSession } from './accountService';
import type { DashboardService } from './dashboardService';

export class DashboardNotConfiguredError extends Error {
  constructor() { super('Chưa cấu hình VITE_API_BASE_URL.'); }
}

async function request(path: string, init: RequestInit = {}) {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new DashboardNotConfiguredError();
  const generation = staffSessionVersion();
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...adminHeaders(), ...init.headers },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
  if (generation !== staffSessionVersion()) throw new Error('Session changed.');
  if (response.status === 401) clearStaffSession();
  if (!response.ok) {
    const error = body?.error as { code?: string } | undefined;
    if (response.status === 401) throw new Error('ADMIN_UNAUTHORIZED: Phiên nhân viên đã hết hạn. Vui lòng đăng nhập lại.');
    throw new Error(error?.code || `API quản trị trả về HTTP ${response.status}.`);
  }
  return body || {};
}

function order(value: unknown): OrderRecord {
  if (!value || typeof value !== 'object') throw new Error('Dữ liệu đơn hàng không hợp lệ.');
  const item = value as Record<string, unknown>;
  const details = item.item as Record<string, unknown> | undefined;
  if (typeof item.orderId !== 'string' || typeof item.status !== 'string' || typeof item.createdAt !== 'string' ||
      !details || typeof details.productId !== 'string' || typeof details.name !== 'string' ||
      typeof details.image !== 'string' || !Number.isInteger(details.quantity) || (details.unitPrice !== null && typeof details.unitPrice !== 'number')) {
    throw new Error('Dữ liệu đơn hàng không hợp lệ.');
  }
  return { totalAmount: typeof item.totalAmount === 'number' ? item.totalAmount : undefined, orderId: item.orderId, status: item.status as OrderRecord['status'], createdAt: Date.parse(item.createdAt),
    item: { productId: details.productId, name: details.name, image: details.image,
      quantity: Number(details.quantity), unitPrice: details.unitPrice,
      ...(details.totalAmount === null || typeof details.totalAmount === 'number' ? { totalAmount: details.totalAmount } : {}),
      ...(typeof details.selectedColor === 'string' ? { selectedColor: details.selectedColor } : {}),
      ...(typeof details.discountAmount === 'number' ? { discountAmount: details.discountAmount } : {}),
      ...(typeof details.voucherCode === 'string' ? { voucherCode: details.voucherCode } : {}) } };
}

function product(value: unknown): Product {
  if (!value || typeof value !== 'object' || typeof (value as Product).productId !== 'string') throw new Error('Dữ liệu sản phẩm không hợp lệ.');
  return value as Product;
}

export const httpDashboardService: DashboardService = {
  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const data = await request('/admin/overview');
    const counts = data.ordersByStatus as Record<string, number> | undefined;
    if (!counts || !Array.isArray(data.products) || !Array.isArray(data.recentOrders) ||
        typeof data.totalRevenue !== 'number' || typeof data.totalOrders !== 'number') {
      throw new Error('Payload /admin/overview không hợp lệ.');
    }
    const products = data.products.map(product);
    const orders = {
      accepted: data.totalOrders,
      pending: Number(counts.PENDING || 0),
      processing: Number(counts.PROCESSING || 0),
      confirmed: Number(counts.CONFIRMED || 0),
      outOfStock: Number(counts.OUT_OF_STOCK || 0),
      failed: Number(counts.FAILED || 0),
    };
    return {
      source: 'AWS', sessionId: 'AWS', updatedAt: String(data.serverTime || new Date().toISOString()),
      totalRevenue: data.totalRevenue, unknownRevenueOrders: Number(data.unknownRevenueOrders || 0), successRate: Number(data.successRate || 0),
      lowStockProducts: (data.lowStockProducts as unknown[]).map(product), orders,
      orderRecords: data.recentOrders.map(order), products,
      // Queue and Lambda telemetry are not part of F05's DynamoDB API payload.
      sqs: { visibleMessages: 0, inFlightMessages: 0, dlqMessages: 0 },
      lambda: { invocations: 0, errors: 0, averageDurationMs: 0, durationBreakdown: [], concurrency: 0, errorRateThreshold: 0 },
      alerts: [],
    };
  },
  async getAdminOrders(status = '', page = 1, limit = 25): Promise<AdminOrdersPage> {
    const query = new URLSearchParams({ limit: String(limit), page: String(page) });
    if (status) query.set('status', status);
    const data = await request(`/admin/orders?${query}`);
    if (!Array.isArray(data.items)) throw new Error('Payload /admin/orders không hợp lệ.');
    return {
      items: data.items.map(order), nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
      page: Number.isInteger(data.page) ? Number(data.page) : page,
      totalPages: Number.isInteger(data.totalPages) ? Number(data.totalPages) : 1,
      totalCount: Number.isInteger(data.totalCount) ? Number(data.totalCount) : data.items.length,
    };
  },
  async createProduct(value) {
    return product(await request('/admin/products', { method: 'POST', body: JSON.stringify(value) }));
  },
  async updateProduct(productId, changes, stockDelta) {
    return product(await request(`/admin/products/${encodeURIComponent(productId)}`, {
      method: 'PATCH', body: JSON.stringify({ ...changes, ...(stockDelta === undefined ? {} : { stockDelta }) }),
    }));
  },
};
