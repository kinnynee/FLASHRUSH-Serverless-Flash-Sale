import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { send } = vi.hoisted(() => ({send:vi.fn()}));
vi.mock('@aws-sdk/client-cognito-identity-provider', async importOriginal => ({
  ...await importOriginal<typeof import('@aws-sdk/client-cognito-identity-provider')>(),
  CognitoIdentityProviderClient: class { send = send; },
}));
const identity = {UserAttributes:[{Name:'sub',Value:'b'},{Name:'email_verified',Value:'true'},{Name:'email',Value:'b@test.invalid'}]};
beforeEach(() => {
  vi.resetModules(); send.mockReset();
  vi.stubEnv('VITE_API_BASE_URL','https://customer.test');
  vi.stubEnv('VITE_COGNITO_CLIENT_ID','client'); vi.stubEnv('VITE_COGNITO_REGION','us-east-1');
  const values = new Map<string,string>();
  vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
  vi.stubGlobal('window',{dispatchEvent:vi.fn()});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('prevents an old refresh from replacing the new customer session', async () => {
  const auth = await import('./customerAuth');
  const key = 'flashrush.customer.session.v2:https://customer.test:client';
  sessionStorage.setItem(key,JSON.stringify({access:'a',refresh:'refresh-a',expires:0}));
  let finish!: (value:unknown)=>void;
  send.mockImplementationOnce(()=>new Promise(resolve=>{ finish=resolve; }));
  const pending = auth.accessToken();
  send.mockResolvedValueOnce({AuthenticationResult:{AccessToken:'b',RefreshToken:'refresh-b',ExpiresIn:600}}).mockResolvedValueOnce(identity);
  await auth.signIn('b@test.invalid','password');
  finish({AuthenticationResult:{AccessToken:'stale-a',ExpiresIn:600}});
  await expect(pending).rejects.toThrow();
  expect(await auth.accessToken()).toBe('b');
});

it('clears customer state before network logout completes and isolates targets', async () => {
  const auth = await import('./customerAuth');
  sessionStorage.setItem('flashrush.customer.session.v2:https://other.test:client',JSON.stringify({access:'other',refresh:'refresh',expires:Date.now()+600000}));
  await expect(auth.accessToken()).rejects.toThrow();
  send.mockResolvedValueOnce({AuthenticationResult:{AccessToken:'b',RefreshToken:'refresh-b',ExpiresIn:600}}).mockResolvedValueOnce(identity);
  await auth.signIn('b@test.invalid','password');
  let finish!: (value:unknown)=>void;
  send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const pending = auth.signOut();
  await expect(auth.accessToken()).rejects.toThrow();
  finish({}); await pending;
});
