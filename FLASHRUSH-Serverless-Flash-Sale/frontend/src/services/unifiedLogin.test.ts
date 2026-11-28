import { beforeEach, expect, it, vi } from 'vitest';
import { loginDestination, resolveLoginDestination } from './unifiedLogin';
const mocks = vi.hoisted(() => ({ token:vi.fn(),clear:vi.fn(),adopt:vi.fn() }));
vi.mock('./customerAuth', () => ({ accessToken:mocks.token }));
vi.mock('./accountService', () => ({clearStaffSession:mocks.clear,useVerifiedStaffToken:mocks.adopt}));
beforeEach(() => {vi.clearAllMocks();vi.stubEnv('VITE_API_BASE_URL','https://api.test');});

it('routes customer, owner, manager, warehouse and support without open redirects', () => {
  expect(loginDestination([], '/admin/users')).toBe('/account');
  expect(loginDestination([], '//evil.test')).toBe('/account');
  expect(loginDestination([], '/cart/checkout')).toBe('/cart/checkout');
  expect(loginDestination(['owner'], '/account')).toBe('/admin');
  expect(loginDestination(['manager'], '/admin/users')).toBe('/admin');
  expect(loginDestination(['warehouse'], '/admin')).toBe('/admin/inventory');
  expect(loginDestination(['support'], '/admin/orders')).toBe('/admin/orders');
  expect(loginDestination(['support'], '/admin/users')).toBe('/admin');
});

it('uses live server roles to establish admin session', async () => {
  const exp = Math.floor(Date.now()/1000)+600;
  const token = 'header.'+btoa(JSON.stringify({exp})) + '.signature';
  mocks.token.mockResolvedValue(token);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({roles:['owner']}),{headers:{'Content-Type':'application/json'}})));
  expect(await resolveLoginDestination('/account')).toBe('/admin');
  expect(mocks.adopt).toHaveBeenCalledWith(token,exp*1000);
});

it('never grants staff session on a failed role request', async () => {
  mocks.token.mockResolvedValue('token');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
  await expect(resolveLoginDestination('/admin')).rejects.toThrow();
  expect(mocks.adopt).not.toHaveBeenCalled();
});

it('rejects late server roles from a replaced session', async () => {
  mocks.token.mockResolvedValueOnce('old').mockResolvedValueOnce('new');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({roles:['owner']}),{headers:{'Content-Type':'application/json'}})));
  await expect(resolveLoginDestination('/admin')).rejects.toThrow('Phiên đăng nhập đã thay đổi.');
  expect(mocks.adopt).not.toHaveBeenCalled();
});
