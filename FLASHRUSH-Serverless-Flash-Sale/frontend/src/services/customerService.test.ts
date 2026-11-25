import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customerService, CustomerApiError } from './customerService';
import { accessToken, clearCustomerSession } from './customerAuth';

vi.mock('./customerAuth', () => ({ accessToken: vi.fn(), clearCustomerSession: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('VITE_API_BASE_URL', 'https://example.test');
  vi.mocked(accessToken).mockResolvedValue('verified-access');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 1, items: [] }), { status: 200 })));
});
describe('Customer service authorization and mutations', () => {
  it('uses only the access token and never sends an owner supplied by the browser', async () => {
    await customerService.cart();
    expect(fetch).toHaveBeenCalledWith('https://example.test/me/cart', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer verified-access' }) }));
  });
  it('strips product snapshots and UI fields from cart mutations', async () => {
    await customerService.saveCart(3, [{ productId: 'sku', quantity: 2, color: '', unitPrice: 100 }]);
    const init = vi.mocked(fetch).mock.calls[0][1]!;
    expect(JSON.parse(String(init.body))).toEqual({ version: 3, items: [{ productId: 'sku', quantity: 2, color: '', unitPrice: 100 }] });
  });
  it('retains the exact caller idempotency key when submitting checkout', async () => {
    await customerService.checkout({ version: 1, lineIds: ['one'], addressId: 'home' }, 'same-request');
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ 'Idempotency-Key': 'same-request' });
  });
  it('clears an expired customer session on 401', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED' } }), { status: 401 }));
    await expect(customerService.cart()).rejects.toBeInstanceOf(CustomerApiError);
    expect(clearCustomerSession).toHaveBeenCalledOnce();
  });
  it('preserves price/version conflicts for the UI and never retries mutations automatically', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: { code: 'PRICE_CHANGED' } }), { status: 409 }));
    await expect(customerService.checkout({ version: 1, lineIds: ['one'], addressId: 'home' }, 'key')).rejects.toMatchObject({ code: 'PRICE_CHANGED', status: 409 });
    expect(fetch).toHaveBeenCalledOnce(); expect(clearCustomerSession).not.toHaveBeenCalled();
  });
  it('never calls a protected API if no session exists', async () => {
    vi.mocked(accessToken).mockRejectedValue(new Error('Login required'));
    await expect(customerService.cart()).rejects.toThrow('Login required');
    expect(fetch).not.toHaveBeenCalled();
  });
});
