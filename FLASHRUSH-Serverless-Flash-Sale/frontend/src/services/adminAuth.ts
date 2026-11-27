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
