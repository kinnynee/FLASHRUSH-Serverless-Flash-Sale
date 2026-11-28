import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accessToken, login, logout, businessRequest, clearStaffSession, useVerifiedStaffToken, staffSessionVersion } from './accountService';
import { staffCanVisit } from '../components/admin/StaffGate';

const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type':'application/json' } });
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL','https://staff.test');
  const values = new Map<string,string>();
  vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  clearStaffSession();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it('expires staff access and ignores late login after logout', async () => {
  let finish!: (value:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{ finish=resolve; })));
  const pending = login('a','password');
  await logout();
  finish(response({accessToken:'old',expiresIn:600}));
  await expect(pending).rejects.toThrow();
  expect(accessToken()).toBe('');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({accessToken:'new',expiresIn:1})));
  await login('b','password');
  expect(accessToken()).toBe('new');
  vi.spyOn(Date,'now').mockReturnValue(Date.now()+2000);
  expect(accessToken()).toBe('');
  vi.restoreAllMocks();
});

it('rejects an old account response after switching staff', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({accessToken:'a',expiresIn:600})));
  await login('a','password');
  let finish!: (value:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{ finish=resolve; })));
  const pending = businessRequest('/admin/users');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({accessToken:'b',expiresIn:600})));
  await login('b','password');
  finish(response({private:'account a'}));
  await expect(pending).rejects.toThrow();
  expect(accessToken()).toBe('b');
});

it('matches role-specific UI permissions including voucher management', () => {
  for (const role of ['owner','manager','warehouse','support','customer']) {
    expect(staffCanVisit([role],'/admin/vouchers')).toBe(['owner','manager'].includes(role));
    expect(staffCanVisit([role],'/admin/inventory')).toBe(['owner','manager','warehouse'].includes(role));
    expect(staffCanVisit([role],'/admin/users')).toBe(role==='owner');
  }
});

it('keeps in-flight staff requests valid when adopting the same verified token twice', () => {
  const expires=Date.now()+600000;
  vi.stubGlobal('window',{dispatchEvent:vi.fn()});
  useVerifiedStaffToken('verified',expires);
  const version=staffSessionVersion();
  useVerifiedStaffToken('verified',expires);
  expect(staffSessionVersion()).toBe(version);
  expect(accessToken()).toBe('verified');
});
