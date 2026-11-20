import type { DashboardSnapshot } from '../types/dashboard';
import type { DashboardService } from './dashboardService';

/**
 * Integration seam for a future protected observability API. No endpoint is
 * assumed because the current MVP API contract exposes no dashboard route.
 */
export class DashboardNotConfiguredError extends Error {
  constructor() {
    super('Chưa cấu hình API giám sát hệ thống.');
  }
}

export const httpDashboardService: DashboardService = {
  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    throw new DashboardNotConfiguredError();
  },
};
