import { accessToken } from './customerAuth';
import { clearStaffSession, useVerifiedStaffToken } from './accountService';
import { staffCanVisit } from '../components/admin/StaffGate';

export function loginDestination(roles: string[], requested: string) {
  const staff = roles.some(role => ['owner', 'manager', 'warehouse', 'support'].includes(role));
  if (staff) {
    const valid = /^\/admin(?:\/[a-zA-Z0-9_-]+)*$/.test(requested);
    if (valid && staffCanVisit(roles, requested)) return requested;
    return roles.includes('owner') || roles.includes('manager') || roles.includes('support') ? '/admin' : '/admin/inventory';
  }
  return /^\/(?:cart(?:\/checkout)?|products(?:\/[^?#]*)?|account(?:\/[^?#]*)?)(?:\?[^#]*)?$/.test(requested) ? requested : '/account';
}

export async function resolveLoginDestination(requested: string) {
  const token = await accessToken();
  const base = import.meta.env.VITE_API_BASE_URL;
  const response = await fetch(`${base?.replace(/\/$/, '')}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Không kiểm tra được quyền truy cập. Vui lòng thử lại.');
  }
  const user = await response.json();
  if (!Array.isArray(user.roles) || user.roles.some((role: unknown) => typeof role !== 'string')) throw new Error('Dữ liệu quyền truy cập không hợp lệ.');
  if (await accessToken() !== token) throw new Error('Phiên đăng nhập đã thay đổi.');
  const destination = loginDestination(user.roles, requested);
  if (destination.startsWith('/admin')) {
    // Cognito access tokens contain exp; role decisions come only from live /auth/me.
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof claims.exp !== 'number') throw new Error('Phiên đăng nhập không hợp lệ.');
    useVerifiedStaffToken(token, claims.exp * 1000);
  } else clearStaffSession();
  return destination;
}
