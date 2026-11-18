import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockProductService } from './mockProductService';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('Mock product service boundary', () => {
  it('returns a complete catalog after an asynchronous loading interval', async () => {
    vi.useFakeTimers();
    const request = mockProductService.getProducts();
    await vi.advanceTimersByTimeAsync(350);
    const products = await request;
    expect(products).toHaveLength(12);
    expect(new Set(products.map(product => product.productId)).size).toBe(12);
    expect(products.some(product => product.stock === 0)).toBe(true);
  });
  it('retrieves a product by stable ID and isolates caller mutations', async () => {
    vi.useFakeTimers();
    const firstRequest = mockProductService.getProductById('sony-wh-1000xm5');
    await vi.advanceTimersByTimeAsync(350);
    const first = await firstRequest;
    expect(first?.stock).toBe(3);
    if (first) first.stock = 0;
    const secondRequest = mockProductService.getProductById('sony-wh-1000xm5');
    await vi.advanceTimersByTimeAsync(350);
    expect((await secondRequest)?.stock).toBe(3);
  });
  it('returns undefined for unknown product IDs', async () => {
    vi.useFakeTimers();
    const request = mockProductService.getProductById('does-not-exist');
    await vi.advanceTimersByTimeAsync(350);
    expect(await request).toBeUndefined();
  });
  it('supports a recoverable error for error-state QA', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_DEMO_SERVICE_ERROR', 'true');
    const assertion = expect(mockProductService.getProducts()).rejects.toThrow('Không thể tải sản phẩm demo');
    await vi.advanceTimersByTimeAsync(350);
    await assertion;
    vi.stubEnv('VITE_DEMO_SERVICE_ERROR', 'false');
    const retry = mockProductService.getProducts();
    await vi.advanceTimersByTimeAsync(350);
    expect((await retry).length).toBe(12);
  });
});
