import type { ReactNode } from 'react';

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="emptyState">
      {icon}
      <div className="emptyState__title">{title}</div>
      {hint && <div className="emptyState__hint">{hint}</div>}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <header className="pageTitle">
      <h1>{children}</h1>
      {sub && <p>{sub}</p>}
    </header>
  );
}
