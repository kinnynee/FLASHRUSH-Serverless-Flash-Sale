import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockOrderService } from './mockOrderService';
import { getAccess, getHistory, getIntent, saveAccess, saveHistory, saveIntent } from './orderStorage';
import type { MockOutcome, PurchaseIntent } from '../types/order';

function storage(): Storage { const data = new Map<string, string>(); return { get length() { return data.size; }, clear: () => data.clear(), getItem: key => data.get(key) ?? null, key: index => [...data.keys()][index] ?? null, removeItem: key => { data.delete(key); }, setItem: (key, value) => { data.set(key, String(value)); } }; }
const makeIntent = (outcome: MockOutcome): PurchaseIntent => ({ key: 'intent-key', outcome, createdAt: 1000, item: { productId: 'p', name: 'Product', image: '/p.jpg', quantity: 1, unitPrice: 100 } });
beforeEach(() => { vi.stubGlobal('sessionStorage', storage()); vi.stubGlobal('localStorage', storage()); vi.useRealTimers(); });
describe('mock order flow', () => {
  it.each(['CONFIRMED', 'OUT_OF_STOCK', 'FAILED'] as const)('acknowledges PENDING then transitions to %s', async outcome => {
    vi.useFakeTimers(); vi.setSystemTime(1000); const intent = makeIntent(outcome); saveIntent(intent);
    const accepted = await mockOrderService.submit(intent); expect(accepted.status).toBe('PENDING');
    expect((await mockOrderService.getOrder(accepted.orderId, intent.key)).status).toBe('PENDING');
    vi.advanceTimersByTime(6000); expect((await mockOrderService.getOrder(accepted.orderId, intent.key)).status).toBe(outcome);
    expect((await mockOrderService.getOrder(accepted.orderId, intent.key)).status).toBe(outcome);
  });
  it('replays the same intent without creating a second order and rejects changed payload', async () => {
    const intent = makeIntent('CONFIRMED'); saveIntent(intent); const first = await mockOrderService.submit(intent);
    expect(getIntent()).toEqual(intent); expect((await mockOrderService.submit(getIntent()!)).orderId).toBe(first.orderId);
    await expect(mockOrderService.submit({ ...intent, item: { ...intent.item, quantity: 2 } })).rejects.toThrow();
  });
  it('keeps access in session storage and refuses access when it is lost', async () => {
    const intent = makeIntent('CONFIRMED'); const order = await mockOrderService.submit(intent); saveAccess(order.orderId, intent.key); saveHistory(order);
    expect(JSON.stringify(getHistory())).not.toContain(intent.key); expect(getAccess()[order.orderId]).toBe(intent.key);
    sessionStorage.clear(); expect(getAccess()[order.orderId]).toBeUndefined(); expect(getHistory()).toHaveLength(1);
    await expect(mockOrderService.getOrder(order.orderId, intent.key)).rejects.toThrow();
  });
});
