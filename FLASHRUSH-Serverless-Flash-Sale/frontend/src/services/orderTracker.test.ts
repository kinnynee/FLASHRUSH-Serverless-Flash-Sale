import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrderTracker } from './orderTracker';
import type { OrderRecord, OrderStatus } from '../types/order';

const order = (status: OrderStatus): OrderRecord => ({ orderId: 'order-1', status, createdAt: 1000, item: { productId: 'p', name: 'Product', image: '', quantity: 1, unitPrice: 100 } });
function setup(fetchOrder = vi.fn<() => Promise<OrderRecord>>().mockResolvedValue(order('PENDING'))) {
  const options = { fetchOrder, isVisible: vi.fn(() => true), onOrder: vi.fn(), onChecking: vi.fn(), onWaiting: vi.fn(), onError: vi.fn() };
  return { ...options, tracker: createOrderTracker(options) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => vi.useRealTimers());

describe('order tracking', () => {
  it.each(['CONFIRMED', 'OUT_OF_STOCK', 'FAILED'] as const)('stops polling at %s', async status => {
    const run = setup(vi.fn<() => Promise<OrderRecord>>().mockResolvedValueOnce(order('PENDING')).mockResolvedValueOnce(order('PROCESSING')).mockResolvedValue(order(status)));
    run.tracker.start();
    await vi.advanceTimersByTimeAsync(20000);
    expect(run.fetchOrder).toHaveBeenCalledTimes(3);
    expect(run.onOrder.mock.calls.map(([o]) => o.status)).toEqual(['PENDING', 'PROCESSING', status]);
    run.tracker.stop();
  });
  it('retains the last result and backs off after an error, then recovers', async () => {
    const run = setup(vi.fn<() => Promise<OrderRecord>>().mockResolvedValueOnce(order('PENDING')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(order('CONFIRMED')));
    run.tracker.start(); await vi.advanceTimersByTimeAsync(2000);
    expect(run.onOrder).toHaveBeenCalledTimes(1);
    expect(run.onError).toHaveBeenLastCalledWith(expect.stringContaining('thử lại'));
    await vi.advanceTimersByTimeAsync(3999); expect(run.fetchOrder).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(run.onOrder).toHaveBeenLastCalledWith(order('CONFIRMED'));
    expect(run.onError).toHaveBeenLastCalledWith(''); run.tracker.stop();
  });
  it('pauses after a minute without declaring failure and resumes manually', async () => {
    const run = setup(); run.tracker.start(); await vi.advanceTimersByTimeAsync(60000);
    expect(run.onWaiting).toHaveBeenLastCalledWith(true);
    const calls = run.fetchOrder.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000); expect(run.fetchOrder).toHaveBeenCalledTimes(calls);
    run.tracker.refresh(); await vi.advanceTimersByTimeAsync(0);
    expect(run.onWaiting).toHaveBeenLastCalledWith(false);
    expect(run.fetchOrder).toHaveBeenCalledTimes(calls + 1); run.tracker.stop();
  });
  it('does not overlap requests or publish responses after unmount', async () => {
    let resolve!: (value: OrderRecord) => void;
    const run = setup(vi.fn(() => new Promise<OrderRecord>(done => { resolve = done; })));
    run.tracker.start(); run.tracker.refresh(); await vi.advanceTimersByTimeAsync(10000);
    expect(run.fetchOrder).toHaveBeenCalledTimes(1);
    run.tracker.stop(); resolve(order('CONFIRMED')); await vi.advanceTimersByTimeAsync(0);
    expect(run.onOrder).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('skips background requests and resumes when visible', async () => {
    const run = setup(); run.isVisible.mockReturnValue(false); run.tracker.start();
    await vi.advanceTimersByTimeAsync(4000); expect(run.fetchOrder).not.toHaveBeenCalled();
    run.isVisible.mockReturnValue(true); await vi.advanceTimersByTimeAsync(2000);
    expect(run.fetchOrder).toHaveBeenCalledTimes(1); run.tracker.stop();
  });
});
