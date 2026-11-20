import type { OrderRecord } from './order';
import type { Product } from './product';

export type DashboardScenario = 'warning' | 'healthy' | 'empty' | 'error';
export type DashboardProduct = Pick<Product, 'productId' | 'name' | 'category' | 'price' | 'images' | 'initialStock' | 'stock'>;

export interface OrderMetrics {
  accepted: number;
  pending: number;
  processing: number;
  confirmed: number;
  outOfStock: number;
  failed: number;
}

export interface SqsMetrics {
  visibleMessages: number;
  inFlightMessages: number;
  dlqMessages: number;
}

export interface LambdaMetrics {
  invocations: number;
  errors: number;
  averageDurationMs: number;
  durationBreakdown: { label: string; ms: number }[];
  concurrency: number;
  errorRateThreshold: number;
  runtime?: string;
}

export interface DashboardAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  createdAt: string;
  message: string;
  status: 'OPEN' | 'RECORDED';
}

export interface DashboardSnapshot {
  source: 'MOCK' | 'AWS';
  /** Fixed example data. This timestamp is not a live AWS observation. */
  sessionId: string;
  updatedAt: string;
  orders: OrderMetrics;
  orderRecords: OrderRecord[];
  products: DashboardProduct[];
  sqs: SqsMetrics;
  lambda: LambdaMetrics;
  alerts: DashboardAlert[];
}
