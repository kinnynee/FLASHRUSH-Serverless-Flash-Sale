import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function AdminRefreshButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="admin-refresh-button" onClick={onClick} disabled={disabled}>
    <RefreshCw size={16} aria-hidden="true" className={disabled ? 'is-spinning' : undefined} />
    Làm mới
  </button>;
}

export function AdminPageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="admin-page-header">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="admin-page-actions">{actions}</div>}
  </header>;
}
