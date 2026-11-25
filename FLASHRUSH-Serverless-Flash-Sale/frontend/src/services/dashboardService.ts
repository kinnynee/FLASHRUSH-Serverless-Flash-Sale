import type { AdminOrdersPage, DashboardScenario, DashboardSnapshot } from '../types/dashboard';
import type { Product } from '../types/product';
import { mockDashboardService } from './mockDashboardService';
import { httpDashboardService, DashboardNotConfiguredError } from './httpDashboardService';
export { httpDashboardService, DashboardNotConfiguredError };

export interface DashboardService {
  getDashboardSnapshot(scenario?: DashboardScenario): Promise<DashboardSnapshot>;
  getAdminOrders(status?: string, page?: number, limit?: number): Promise<AdminOrdersPage>;
  createProduct(product: Product): Promise<Product>;
  updateProduct(productId: string, changes: Partial<Product>, stockDelta?: number): Promise<Product>;
}

export const dashboardService: DashboardService = import.meta.env.VITE_API_BASE_URL ? httpDashboardService : mockDashboardService;
