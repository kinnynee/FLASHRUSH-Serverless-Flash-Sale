import { describe, expect, it } from 'vitest';
import { mockDashboardService } from './mockDashboardService';

describe('mockDashboardService', () => {
  it('keeps the warning snapshot consistent with orders and inventory', async () => {
    const snapshot = await mockDashboardService.getDashboardSnapshot('warning');
    expect(snapshot.orders).toMatchObject({ accepted: 100, pending: 0, processing: 0, confirmed: 10, outOfStock: 88, failed: 2 });
    expect(snapshot.orderRecords).toHaveLength(snapshot.orders.accepted);
    expect(snapshot.source).toBe('MOCK');
    expect(snapshot.lambda.runtime).toBe('Python 3.12 · arm64');
    expect(snapshot.products.map(product => [product.productId, product.stock])).toEqual([
      ['sony-wh-1000xm5', 0], ['keychron-k2', 0], ['logitech-mx-master-3s', 4],
    ]);
  });

  it('exposes controlled healthy and empty scenarios', async () => {
    const healthy = await mockDashboardService.getDashboardSnapshot('healthy');
    const empty = await mockDashboardService.getDashboardSnapshot('empty');
    expect(healthy.orders).toMatchObject({ accepted: 100, confirmed: 10, outOfStock: 88, failed: 0, pending: 1, processing: 1 });
    expect(healthy.sqs.dlqMessages).toBe(0);
    expect(empty.orderRecords).toHaveLength(0);
    expect(empty.products).toHaveLength(0);
  });
});
