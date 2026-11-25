import { getScenarioOrders, scenarioTelemetry, sessionProducts, snapshotTime } from '../mocks/dashboardMockData';
import type { DashboardAlert, OrderMetrics } from '../types/dashboard';
import type { OrderStatus } from '../types/order';
import type { DashboardService } from './dashboardService';

const metricByStatus: Record<OrderStatus, Exclude<keyof OrderMetrics, 'accepted'>> = {
  PENDING: 'pending', PROCESSING: 'processing', CONFIRMED: 'confirmed', OUT_OF_STOCK: 'outOfStock', FAILED: 'failed',
};

export const mockDashboardService: DashboardService = {
  async getDashboardSnapshot(scenario = 'warning') {
    await new Promise(resolve => setTimeout(resolve, 350));
    if (scenario === 'error') throw new Error('Không thể tải snapshot của kịch bản lỗi kết nối.');

    const orderRecords = scenario === 'empty' ? [] : getScenarioOrders(scenario).reverse();
    const { sqs, lambda } = scenarioTelemetry[scenario];
    const orders: OrderMetrics = { accepted: orderRecords.length, pending: 0, processing: 0, confirmed: 0, outOfStock: 0, failed: 0 };
    const confirmedStock = new Map<string, number>();
    for (const order of orderRecords) {
      orders[metricByStatus[order.status]]++;
      if (order.status === 'CONFIRMED') {
        for (const { productId, quantity } of order.items) {
          confirmedStock.set(productId, (confirmedStock.get(productId) ?? 0) + quantity);
        }
      }
    }

    const products = scenario === 'empty' ? [] : sessionProducts.map(product => {
      const stock = product.initialStock - (confirmedStock.get(product.productId) ?? 0);
      if (stock < 0) throw new Error(`Snapshot có tồn kho âm cho ${product.productId}.`);
      return { ...product, stock };
    });

    const alerts: DashboardAlert[] = [];
    if (sqs.dlqMessages > 0) alerts.push({
      id: 'dlq', severity: 'CRITICAL', createdAt: snapshotTime, status: 'OPEN',
      message: `Phát hiện ${sqs.dlqMessages} message trong Dead-Letter Queue (DLQ). Cần kiểm tra nguyên nhân trước khi xử lý lại.`,
    });
    const errorRate = lambda.invocations ? lambda.errors / lambda.invocations * 100 : 0;
    if (errorRate > lambda.errorRateThreshold) alerts.push({
      id: 'lambda-errors', severity: 'WARNING', createdAt: '2026-11-18T07:22:05Z', status: 'OPEN',
      message: `Tỷ lệ Lambda Error ${errorRate.toFixed(1)}% vượt ngưỡng demo ${lambda.errorRateThreshold}%.`,
    });
    if (orders.confirmed > 0) alerts.push({
      id: 'confirmed', severity: 'INFO', createdAt: '2026-11-18T07:22:01Z', status: 'RECORDED',
      message: `Đã xác nhận ${orders.confirmed} đơn hàng trong phiên Flash Sale.`,
    });

    return structuredClone({
      source: 'MOCK', sessionId: { warning: 'DEMO-01', healthy: 'DEMO-02', empty: 'DEMO-03' }[scenario], updatedAt: snapshotTime,
      orders, orderRecords, products, sqs, lambda, alerts,
    });
  },
};
