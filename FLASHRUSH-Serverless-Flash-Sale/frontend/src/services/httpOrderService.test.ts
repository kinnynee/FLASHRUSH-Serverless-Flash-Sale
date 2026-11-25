import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpOrderService } from './httpOrderService';
import { isTerminal, type PurchaseIntent } from '../types/order';

const intent: PurchaseIntent = {
  key: 'same-secret-key', createdAt: 1000, outcome: 'CONFIRMED',
  items: [
    { productId: 'b', name: 'B', quantity: 2, unitPrice: 10, selectedColor: 'Đen' },
    { productId: 'a', name: 'A', quantity: 1, unitPrice: 10 },
  ],
};
const createdAt = '2026-11-25T00:00:00Z';
const items = [
  { productId: 'a', name: 'A (catalog)', image: '/a.jpg', quantity: 1, unitPrice: 100, subtotal: 100 },
  { productId: 'b', name: 'B (catalog)', image: '/b.jpg', quantity: 2, unitPrice: 200, subtotal: 400 },
];
const record = { orderId: 'order-1', status: 'PENDING', createdAt, items, totalQuantity: 3, subtotal: 500, discountAmount: 0, totalAmount: 500 };
const response = (data: unknown, status: number) => new Response(JSON.stringify(data), { status });

beforeEach(() => vi.stubEnv('VITE_API_BASE_URL', 'https://example.test'));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('HTTP order boundary', () => {
  it('uses the same canonical payload and idempotency key after an ambiguous retry', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Network failure')).mockImplementation(async () => response(record, 202));
    vi.stubGlobal('fetch', fetcher);
    await expect(httpOrderService.submit(intent)).rejects.toThrow();
    const order = await httpOrderService.submit(intent);
    expect(order).toMatchObject({ status: 'PENDING', totalQuantity: 3, totalAmount: 500, createdAt: Date.parse(createdAt) });
    expect(order.items[0]).toMatchObject(items[0]);
    expect(order.items[1]).toMatchObject({ ...items[1], selectedColor: 'Đen' });
    for (const [, init] of fetcher.mock.calls) {
      expect(init.headers['Idempotency-Key']).toBe(intent.key);
      expect(JSON.parse(init.body)).toEqual({ items: [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 2 }] });
    }
  });

  it('polls using the access token and reads snapshots without catalog requests', async () => {
    const fetcher = vi.fn().mockImplementation(async () => response({ ...record, status: 'CONFIRMED', confirmedAt: createdAt }, 200));
    vi.stubGlobal('fetch', fetcher);
    const order = await httpOrderService.getOrder('order-1', intent.key);
    expect(order).toMatchObject({ status: 'CONFIRMED', confirmedAt: Date.parse(createdAt), items });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers['X-Order-Token']).toBe(intent.key);
  });

  it('normalizes a legacy response without inventing a price', async () => {
    const fetcher = vi.fn().mockImplementation(async () => response({
      orderId: 'order-1', status: 'CONFIRMED', createdAt, productId: 'a', quantity: 1,
    }, 200));
    vi.stubGlobal('fetch', fetcher);
    const order = await httpOrderService.getOrder('order-1', intent.key);
    expect(order.items[0]).toMatchObject({ productId: 'a', quantity: 1, unitPrice: undefined });
    expect(order.totalAmount).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([400, 404, 409, 429, 500, 503])('rejects HTTP %s without fabricating a FAILED order', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, status)));
    await expect(httpOrderService.submit(intent)).rejects.toMatchObject({ status, definitelyRejected: false });
  });

  it('distinguishes a known pre-intake rejection from a conflict on a key', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ error: { code: 'CAMPAIGN_QUANTITY_LIMIT', retryable: false } }, 409))
      .mockResolvedValueOnce(response({ error: { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT', retryable: false } }, 409)));
    await expect(httpOrderService.submit(intent)).rejects.toMatchObject({ definitelyRejected: true });
    await expect(httpOrderService.submit(intent)).rejects.toMatchObject({ definitelyRejected: false });
  });

  it('keeps transport failure separate from terminal order state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network failure')));
    await expect(httpOrderService.submit(intent)).rejects.toThrow();
    expect(isTerminal('PENDING')).toBe(false);
    expect(isTerminal('PROCESSING')).toBe(false);
    expect(isTerminal('FAILED')).toBe(true);
  });
});
