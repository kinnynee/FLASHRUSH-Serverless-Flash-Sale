import { products } from './products';
import type { DashboardProduct, LambdaMetrics, SqsMetrics } from '../types/dashboard';
import type { OrderRecord, OrderStatus } from '../types/order';

export const snapshotTime = '2026-11-18T07:22:18Z';
const sessionStock = { 'sony-wh-1000xm5': 10, 'keychron-k2': 5, 'logitech-mx-master-3s': 12 };

export const sessionProducts: DashboardProduct[] = Object.entries(sessionStock).map(([productId, initialStock]) => {
  const product = products.find(item => item.productId === productId);
  if (!product) throw new Error(`Thiếu sản phẩm demo ${productId}.`);
  const { name, category, price, images } = product;
  return { productId, name, category, price, images, initialStock, stock: initialStock };
});

export function getScenarioOrders(scenario: 'warning' | 'healthy'): OrderRecord[] {
  const [headphones, keyboard, mouse] = sessionProducts;
  const records: OrderRecord[] = [];

  function add(product: DashboardProduct, status: OrderStatus, quantity: number) {
    records.push({
      orderId: `FR-${String(records.length + 1).padStart(6, '0')}`,
      status,
      createdAt: Date.parse(snapshotTime) - (200 - records.length) * 1000,
      item: { productId: product.productId, name: product.name, image: product.images[0], unitPrice: product.price, quantity },
    });
  }

  // Ten confirmed orders consume all 10 headphones, all 5 keyboards and
  // eight mice. The stock table is therefore derived from the same orders.
  add(headphones, 'CONFIRMED', 3);
  add(headphones, 'CONFIRMED', 3);
  add(headphones, 'CONFIRMED', 2);
  add(headphones, 'CONFIRMED', 2);
  add(keyboard, 'CONFIRMED', 2);
  add(keyboard, 'CONFIRMED', 2);
  add(keyboard, 'CONFIRMED', 1);
  add(mouse, 'CONFIRMED', 3);
  add(mouse, 'CONFIRMED', 3);
  add(mouse, 'CONFIRMED', 2);
  for (let i = 0; i < 87; i++) add(headphones, 'OUT_OF_STOCK', 1);
  add(keyboard, 'OUT_OF_STOCK', 1);
  add(mouse, scenario === 'warning' ? 'FAILED' : 'PROCESSING', 1);
  add(mouse, scenario === 'warning' ? 'FAILED' : 'PENDING', 1);
  return records;
}

export const scenarioTelemetry: Record<'warning' | 'healthy' | 'empty', { sqs: SqsMetrics; lambda: LambdaMetrics }> = {
  warning: {
    sqs: { visibleMessages: 0, inFlightMessages: 0, dlqMessages: 2 },
    lambda: {
      invocations: 100, errors: 2, averageDurationMs: 85, concurrency: 0, errorRateThreshold: 1,
      durationBreakdown: [{ label: 'DynamoDB', ms: 60 }, { label: 'Logic worker', ms: 15 }, { label: 'Mạng', ms: 10 }],
    },
  },
  healthy: {
    sqs: { visibleMessages: 1, inFlightMessages: 1, dlqMessages: 0 },
    lambda: {
      invocations: 101, errors: 0, averageDurationMs: 75, concurrency: 1, errorRateThreshold: 1,
      durationBreakdown: [{ label: 'DynamoDB', ms: 52 }, { label: 'Logic worker', ms: 15 }, { label: 'Mạng', ms: 8 }],
    },
  },
  empty: {
    sqs: { visibleMessages: 0, inFlightMessages: 0, dlqMessages: 0 },
    lambda: { invocations: 0, errors: 0, averageDurationMs: 0, concurrency: 0, errorRateThreshold: 1, durationBreakdown: [] },
  },
};
