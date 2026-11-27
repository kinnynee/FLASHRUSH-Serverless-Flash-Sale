export interface Account {
  id: string;
  username: string;
  name: string;
  email: string;
  roles: string[];
}
const tokenKey = `flashrush.accessToken:${import.meta.env.VITE_API_BASE_URL || "unconfigured"}`;
export function accessToken() {
  try {
    return sessionStorage.getItem(tokenKey) || "";
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
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (response.status === 404) throw new Error('Tính năng này chưa được triển khai trên API đang kết nối.');
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('API trả sai định dạng. Vui lòng kiểm tra kết nối local.');
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.code || "Không thể xử lý yêu cầu.");
  return data;
}
export async function login(email: string, password: string, session?: string) {
  const data = await businessRequest(
    session ? "/auth/new-password" : "/auth/login",
    "POST",
    { email, password, session },
  );
  if (data.accessToken) sessionStorage.setItem(tokenKey, data.accessToken);
  return data;
}
export async function logout() {
  try {
    await businessRequest("/auth/logout", "POST", {});
  } finally {
    sessionStorage.removeItem(tokenKey);
  }
}
