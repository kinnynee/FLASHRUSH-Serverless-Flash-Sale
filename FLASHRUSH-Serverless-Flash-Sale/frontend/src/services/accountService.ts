export interface Account {
  id: string;
  username: string;
  name: string;
  email: string;
  roles: string[];
}
const tokenKey = () => `flashrush.accessToken:${import.meta.env.VITE_API_BASE_URL || "unconfigured"}`;
let generation = 0;
export const staffSessionVersion = () => generation;
export function clearStaffSession() {
  generation++;
  try { sessionStorage.removeItem(tokenKey()); sessionStorage.removeItem(tokenKey() + ':expires'); sessionStorage.removeItem('flashrush.adminApiKey.v1'); } catch { /* Storage can be unavailable. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('staff-session-changed'));
}
export function accessToken() {
  try {
    const expires = Number(sessionStorage.getItem(tokenKey() + ':expires'));
    if (!Number.isFinite(expires) || expires <= Date.now()) return '';
    return sessionStorage.getItem(tokenKey()) || "";
  } catch {
    return "";
  }
}
export function authHeaders(): Record<string, string> {
  const token = accessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
export async function businessRequest(
  path: string,
  method = "GET",
  payload?: unknown,
) {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error("Chưa cấu hình API.");
  const current = generation;
  const token = accessToken();
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (current !== generation) throw new Error('Phiên đăng nhập đã thay đổi.');
  if (response.status === 401 && token) clearStaffSession();
  if (response.status === 404) throw new Error('Tính năng này chưa được triển khai trên API đang kết nối.');
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('API trả sai định dạng. Vui lòng kiểm tra kết nối local.');
  const data = await response.json();
  if (current !== generation) throw new Error('Session changed.');
  if (!response.ok)
    throw new Error(data.error?.code || "Không thể xử lý yêu cầu.");
  return data;
}
export async function login(email: string, password: string, session?: string) {
  clearStaffSession();
  const current = generation;
  const data = await businessRequest(
    session ? "/auth/new-password" : "/auth/login",
    "POST",
    { email, password, session },
  );
  if (current !== generation) throw new Error('Phiên đăng nhập đã thay đổi.');
  if (data.accessToken) {
    sessionStorage.setItem(tokenKey(), data.accessToken);
    sessionStorage.setItem(tokenKey() + ':expires', String(Date.now() + Number(data.expiresIn) * 1000));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('staff-session-changed'));
  }
  return data;
}
export async function logout() {
  const token = accessToken();
  clearStaffSession();
  try {
    if (token) await fetch(`${String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000),
    });
  } finally { /* Local state was cleared before the network request. */ }
}
