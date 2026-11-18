import { SearchX, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
export interface EmptyStateProps { title: string; description: string; error?: boolean; children?: ReactNode; }
export function EmptyState({ title, description, error, children }: EmptyStateProps) {
  const Icon = error ? TriangleAlert : SearchX;
  return <section className="empty-state" role={error ? 'alert' : 'status'}><Icon size={36} /><h2>{title}</h2><p>{description}</p>{children}</section>;
}
