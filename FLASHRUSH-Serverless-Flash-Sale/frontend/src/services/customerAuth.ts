import { clearStaffSession } from './accountService';
import {
  CognitoIdentityProviderClient, InitiateAuthCommand, SignUpCommand, ConfirmSignUpCommand,
  ResendConfirmationCodeCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand,
  GetUserCommand, ChangePasswordCommand, GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
const region = import.meta.env.VITE_COGNITO_REGION as string | undefined;
export const customerConfigured = Boolean(clientId && region && import.meta.env.VITE_API_BASE_URL);
const client = new CognitoIdentityProviderClient({ region: region || 'us-east-1' });
const storageKey = `flashrush.customer.session.v2:${import.meta.env.VITE_API_BASE_URL}:${clientId}`;
type Session = { access: string; refresh: string; expires: number };
export type CustomerIdentity = { sub: string; email: string; name: string };
let generation = 0;
export const customerSessionVersion = () => generation;
let refreshing: Promise<string> | undefined;
function read(): Session | null {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { return null; }
}
function required() {
  if (!customerConfigured) throw new Error('Chức năng tài khoản chưa được cấu hình Cognito. Cần triển khai backend và cấu hình kết nối trước khi sử dụng.');
}
export function clearCustomerSession() {
  clearStaffSession();
  generation++;
  refreshing = undefined;
  sessionStorage.removeItem(storageKey);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('customer-session-expired'));
}
export async function accessToken(): Promise<string> {
  required();
  const session = read();
  if (!session) throw new Error('Vui lòng đăng nhập để tiếp tục.');
  if (session.expires > Date.now() + 30000) return session.access;
  if (!refreshing) {
    const current = generation;
    refreshing = client.send(new InitiateAuthCommand({ ClientId: clientId, AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: session.refresh } }))
      .then(result => {
        const auth = result.AuthenticationResult;
        if (!auth?.AccessToken || current !== generation) throw new Error('Phiên đăng nhập đã thay đổi.');
        sessionStorage.setItem(storageKey, JSON.stringify({ access: auth.AccessToken, refresh: session.refresh, expires: Date.now() + (auth.ExpiresIn || 600) * 1000 }));
        return auth.AccessToken;
      }).catch(error => {
        if (current === generation && error instanceof Error && error.name === 'NotAuthorizedException') clearCustomerSession();
        throw error;
      }).finally(() => { if (current === generation) refreshing = undefined; });
  }
  return refreshing;
}
export async function currentCustomer(): Promise<CustomerIdentity | null> {
  if (!customerConfigured || !read()) return null;
  const current = generation;
  try {
    const result = await client.send(new GetUserCommand({ AccessToken: await accessToken() }));
    if (current !== generation) throw new Error('Phiên đăng nhập đã thay đổi.');
    const attrs = Object.fromEntries((result.UserAttributes || []).map(a => [a.Name!, a.Value || '']));
    if (!attrs.sub || attrs.email_verified !== 'true') throw new Error('Vui lòng xác minh email trước khi đăng nhập.');
    return { sub: attrs.sub, email: attrs.email, name: attrs.name || attrs.email };
  } catch (error) {
    if (current === generation && error instanceof Error && error.name === 'NotAuthorizedException') { clearCustomerSession(); return null; }
    throw error;
  }
}
export class NewPasswordRequired extends Error {
  constructor(public session: string) { super('Đặt mật khẩu mới để hoàn tất đăng nhập.'); }
}
export async function signIn(email: string, password: string) {
  required();
  clearCustomerSession();
  const current = generation;
  const result = await client.send(new InitiateAuthCommand({ ClientId: clientId, AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: email, PASSWORD: password } }));
  if (current !== generation) throw new Error('Phiên đăng nhập đã thay đổi.');
  if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED' && result.Session) throw new NewPasswordRequired(result.Session);
  const auth = result.AuthenticationResult;
  if (!auth?.AccessToken || !auth.RefreshToken) throw new Error('Tài khoản yêu cầu bước xác minh bổ sung. Vui lòng liên hệ hỗ trợ.');
  sessionStorage.setItem(storageKey, JSON.stringify({ access: auth.AccessToken, refresh: auth.RefreshToken, expires: Date.now() + (auth.ExpiresIn || 600) * 1000 }));
  return currentCustomer();
}
export async function signUp(email: string, password: string, name: string) {
  required();
  await client.send(new SignUpCommand({ ClientId: clientId, Username: email, Password: password, UserAttributes: [{ Name: 'email', Value: email }, { Name: 'name', Value: name }] }));
}
export async function confirmSignUp(email: string, code: string) {
  required(); await client.send(new ConfirmSignUpCommand({ ClientId: clientId, Username: email, ConfirmationCode: code }));
}
export async function resendConfirmation(email: string) {
  required(); await client.send(new ResendConfirmationCodeCommand({ ClientId: clientId, Username: email }));
}
export async function forgotPassword(email: string) {
  required(); await client.send(new ForgotPasswordCommand({ ClientId: clientId, Username: email }));
}
export async function resetPassword(email: string, code: string, password: string) {
  required(); await client.send(new ConfirmForgotPasswordCommand({ ClientId: clientId, Username: email, ConfirmationCode: code, Password: password }));
}
export async function changePassword(previous: string, proposed: string) {
  await client.send(new ChangePasswordCommand({ AccessToken: await accessToken(), PreviousPassword: previous, ProposedPassword: proposed }));
}
export async function signOut() {
  const token = read()?.access;
  clearCustomerSession();
  if (token) await client.send(new GlobalSignOutCommand({ AccessToken: token }));
}
