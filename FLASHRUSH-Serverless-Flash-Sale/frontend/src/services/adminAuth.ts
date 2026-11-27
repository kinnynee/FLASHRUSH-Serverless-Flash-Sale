import { authHeaders } from './accountService';
const storageKey = 'flashrush.adminApiKey.v1';

export function getAdminKey() {
  try { return sessionStorage.getItem(storageKey) || ''; } catch { return ''; }
}

export function setAdminKey(value: string) {
  try {
    if (value) sessionStorage.setItem(storageKey, value);
    else sessionStorage.removeItem(storageKey);
  } catch { /* The key remains available in this page's state. */ }
}

export function adminHeaders(): Record<string, string> {
  const key = getAdminKey();
  const bearer = authHeaders();
  if (bearer.Authorization) return bearer;
  return key ? { 'X-Admin-Key': key } : {};
}

/** Turns API implementation codes into guidance an operator can act on. */
export function adminErrorMessage(error: unknown, fallback = 'Không thể hoàn tất thao tác quản trị.') {
  const message = error instanceof Error ? error.message : '';
  if (message === 'ADMIN_UNAUTHORIZED' || message === 'UNAUTHORIZED' || message === 'FORBIDDEN') {
    return 'Không thể xác thực quyền quản trị. Hãy kiểm tra API Key trong phiên làm việc rồi thử lại.';
  }
  if (message === 'API_NOT_CONFIGURED') return 'Chưa cấu hình API quản trị. Hãy kiểm tra VITE_API_BASE_URL trong môi trường chạy.';
  return message || fallback;
}
