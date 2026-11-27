import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpOrderService } from './httpOrderService';
import { httpDashboardService } from './httpDashboardService';
import { isTerminal, type PurchaseIntent } from '../types/order';
const intent: PurchaseIntent = { key: 'same-secret-key', createdAt: 1000, outcome: 'CONFIRMED', item: { productId: 'sony-wh-1000xm5', name: 'Demo', image: '/demo.jpg', quantity: 1, unitPrice: 10 } };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('HTTP order boundary', () => {
  it('preserves variants and explicitly unknown totals in staff order views', async () => {
    vi.stubEnv('VITE_API_BASE_URL','https://example.test');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({items:[{orderId:'old',status:'CONFIRMED',createdAt:'2026-01-01T00:00:00Z',
      item:{productId:'deleted',name:'Original',image:'/original.jpg',quantity:1,unitPrice:100,totalAmount:null,selectedColor:'Blue'}}]}))));
    const result = await httpDashboardService.getAdminOrders();
    expect(result.items[0].item).toMatchObject({unitPrice:100,totalAmount:null,selectedColor:'Blue'});
  });
  it('uses immutable response snapshots without any catalog request', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({orderId:'old', status:'CONFIRMED', productId:'deleted', quantity:2,
      item:{name:'Historical name',image:'/old.jpg',unitPrice:100,selectedColor:'Blue'}, totalAmount:150, discount:50})));
    vi.stubGlobal('fetch',fetcher);
    const order = await httpOrderService.getOrder('old','secret');
    expect(order.item).toMatchObject({name:'Historical name',unitPrice:100,totalAmount:150,selectedColor:'Blue'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('shows unknown legacy prices instead of zero or the current catalog price', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({orderId:'old',status:'CONFIRMED',productId:'deleted',quantity:1}))));
    const order = await httpOrderService.getOrder('old','secret');
    expect(order.item.unitPrice).toBeNull();
    expect(order.item.totalAmount).toBeNull();
  });
  it('sends the same idempotency key and canonical payload on retry', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orderId: 'order-1', status: 'PENDING' }), { status: 202 }));
    fetcher.mockImplementation(async () => new Response(JSON.stringify({ orderId: 'order-1', status: 'PENDING' }), { status: 202 }));
    vi.stubGlobal('fetch', fetcher);
    expect((await httpOrderService.submit(intent)).status).toBe('PENDING');
    await httpOrderService.submit(intent);
    for (const [, init] of fetcher.mock.calls) {
      expect(init.headers['Idempotency-Key']).toBe(intent.key);
      expect(JSON.parse(init.body)).toEqual({ productId: intent.item.productId, quantity: 1 });
    }
  });
  it.each([400, 404, 409, 429, 500, 503])('rejects HTTP %s without fabricating a FAILED order', async status => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
    await expect(httpOrderService.submit(intent)).rejects.toMatchObject({ status });
  });
  it('keeps transport failure separate from terminal order state', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network failure')));
    await expect(httpOrderService.submit(intent)).rejects.toThrow();
    expect(isTerminal('PENDING')).toBe(false);
    expect(isTerminal('PROCESSING')).toBe(false);
    expect(isTerminal('FAILED')).toBe(true);
  });
});
