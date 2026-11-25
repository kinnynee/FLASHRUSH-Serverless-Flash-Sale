import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockOrderService } from './mockOrderService';
import { getAccess, getHistory, getIntent, saveAccess, saveHistory, saveIntent } from './orderStorage';
import type { MockOutcome, PurchaseIntent } from '../types/order';

const items: PurchaseIntent['items'] = [
  { productId: 'p', name: 'Product', image: '/p.jpg', quantity: 1, unitPrice: 100, subtotal: 100 },
  { productId: 'q', name: 'Other product', image: '/q.jpg', quantity: 2, unitPrice: 300, subtotal: 600 },
];
const makeIntent = (outcome?: MockOutcome): PurchaseIntent => ({ key: 'intent-key', outcome, createdAt: 1000, items });

function storage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; }, clear: () => data.clear(), getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null, removeItem: key => { data.delete(key); }, setItem: (key, value) => { data.set(key, String(value)); },
  };
}
beforeEach(() => { vi.stubGlobal('sessionStorage', storage()); vi.stubGlobal('localStorage', storage()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('mock order flow', () => {
  it.each(['CONFIRMED', 'OUT_OF_STOCK', 'FAILED'] as const)('acknowledges a two-product order then transitions to %s', async outcome => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const intent = makeIntent(outcome);
    saveIntent(intent);

    const accepted = await mockOrderService.submit(getIntent()!);
    expect(accepted).toMatchObject({ status: 'PENDING', totalQuantity: 3, totalAmount: 700, items });
    expect((await mockOrderService.getOrder(accepted.orderId, intent.key)).status).toBe('PENDING');
    vi.advanceTimersByTime(6000);
    const settled = await mockOrderService.getOrder(accepted.orderId, intent.key);
    expect(settled.status).toBe(outcome);
    expect(settled.confirmedAt).toBe(outcome === 'CONFIRMED' ? 7000 : undefined);
    expect(await mockOrderService.getOrder(accepted.orderId, intent.key)).toEqual(settled);
  });

  it('replays the saved payload and rejects a changed quantity or a second unresolved intent', async () => {
    vi.useFakeTimers();
    const intent = makeIntent();
    saveIntent(intent);
    const first = await mockOrderService.submit(intent);
    expect(getIntent()).toMatchObject({ key: intent.key, items, createdAt: intent.createdAt });
    expect((await mockOrderService.submit(getIntent()!)).orderId).toBe(first.orderId);
    expect((await mockOrderService.submit({ ...intent, items: [...items].reverse() })).orderId).toBe(first.orderId);
    await expect(mockOrderService.submit({ ...intent, items: [{ ...items[0], quantity: 2 }, items[1]] })).rejects.toThrow();
    expect(() => saveIntent({ ...intent, key: 'different-key' })).toThrow();
    expect(getIntent()?.key).toBe(intent.key);
    vi.advanceTimersByTime(6000);
    expect((await mockOrderService.getOrder(first.orderId, intent.key)).status).toBe('CONFIRMED');
  });

  it('keeps access in session storage and refuses access when it is lost', async () => {
    const intent = makeIntent('CONFIRMED');
    const order = await mockOrderService.submit(intent);
    saveAccess(order.orderId, intent.key);
    saveHistory(order);
    expect(JSON.stringify(getHistory())).not.toContain(intent.key);
    expect(getAccess()[order.orderId]).toBe(intent.key);
    sessionStorage.clear();
    expect(getAccess()[order.orderId]).toBeUndefined();
    expect(getHistory()).toHaveLength(1);
    await expect(mockOrderService.getOrder(order.orderId, intent.key)).rejects.toThrow();
  });

  it('restores existing single-product storage and preserves only known historical prices', async () => {
    const legacyOrder = { orderId: 'demo-legacy', item: items[0], createdAt: 1000, status: 'CONFIRMED' };
    const legacyIntent = { key: 'intent-key', createdAt: 1000, outcome: 'CONFIRMED', item: items[0] };
    sessionStorage.setItem('flashrush.mock.intent.v1', JSON.stringify(legacyIntent));
    sessionStorage.setItem('flashrush.mock.orders.v1', JSON.stringify({
      'demo-legacy': { order: legacyOrder, key: legacyIntent.key, outcome: legacyIntent.outcome, readyAt: 7000 },
    }));
    localStorage.setItem('flashrush.mock.history.v1', JSON.stringify([legacyOrder, { ...legacyOrder, orderId: 'ord_legacy' }]));
    expect(getIntent()).toMatchObject({ key: legacyIntent.key, items: [items[0]] });
    expect((await mockOrderService.submit(getIntent()!)).orderId).toBe('demo-legacy');
    const [mock, http] = getHistory();
    expect(mock.totalAmount).toBe(100);
    expect(http.items[0].unitPrice).toBeUndefined();
    expect(http.totalAmount).toBeUndefined();
  });
});
