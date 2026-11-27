import { authHeaders } from './accountService';

export function adminHeaders(): Record<string, string> {
  return authHeaders();
}
