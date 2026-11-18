import type { DashboardScenario, DashboardSnapshot } from '../types/dashboard';
import { mockDashboardService } from './mockDashboardService';
export { httpDashboardService, DashboardNotConfiguredError } from './httpDashboardService';

export interface DashboardService {
  getDashboardSnapshot(scenario?: DashboardScenario): Promise<DashboardSnapshot>;
}

export const dashboardService: DashboardService = mockDashboardService;
