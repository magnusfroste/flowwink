import type { ReactNode } from 'react';

/**
 * Shared per-tab header used across the Accounting module.
 * Editorial serif title + one calm muted lead line — no card, no icons.
 * Optional right-aligned `actions` slot for tab-scoped tools.
 */
export function AccountingTabHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-1">
      <div className="min-w-0">
        <h2 className="font-serif text-2xl leading-tight tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
