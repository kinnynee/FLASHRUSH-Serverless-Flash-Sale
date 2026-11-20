import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

it.each([null, {}, { items: [null] }, { items: [{ productId: 'invalid' }] }])('rejects malformed HTTP catalogs: %j', async data => {
  vi.stubEnv('VITE_ORDER_MODE', 'http');
  vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
  const { productService } = await import('./productService');
  await expect(productService.getProducts()).rejects.toThrow();
});

it('accepts the catalog contract without replacing stock', async () => {
  vi.stubEnv('VITE_ORDER_MODE', 'http');
  vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
  const item = { productId: 'sku', name: 'Demo', description: '', category: 'Lab', price: 10,
    originalPrice: 20, stock: 2, initialStock: 3, images: ['/demo.jpg'], isFlashSale: true,
    saleEndsAt: '2030-01-01T00:00:00Z' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [item] }))));
  const { productService } = await import('./productService');
  expect(await productService.getProducts()).toEqual([item]);
});
