import { authHeaders } from './accountService';

export function adminHeaders(): Record<string, string> {
  return authHeaders();
}

/** Turns API implementation codes into guidance an operator can act on. */
export function adminErrorMessage(error: unknown, fallback = 'Không thể hoàn tất thao tác quản trị.') {
  const message = error instanceof Error ? error.message : '';
  if (message === 'ADMIN_UNAUTHORIZED' || message === 'UNAUTHORIZED' || message === 'FORBIDDEN') {
    return 'Không thể xác thực quyền quản trị. Hãy đăng nhập lại bằng tài khoản nhân viên có quyền phù hợp rồi thử lại.';
  }
  if (message === 'API_NOT_CONFIGURED') return 'Chưa cấu hình API quản trị. Hãy kiểm tra VITE_API_BASE_URL trong môi trường chạy.';
  return message || fallback;
}
