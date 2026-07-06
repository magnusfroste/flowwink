import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const sekFmt = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function fmtSek(cents: number): string {
  const v = (cents ?? 0) / 100;
  const s = sekFmt.format(Math.abs(Math.round(v)));
  return `${v < 0 ? '−' : ''}${s} kr`;
}

export function DashCard({
  label,
  children,
  onClick,
  className,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'text-left w-full rounded-lg border border-border bg-card p-6 flex flex-col gap-3 min-h-[160px] transition-colors',
        onClick && 'hover:bg-muted/40 cursor-pointer',
        className,
      )}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </Comp>
  );
}

export function BigFigure({
  value,
  tone = 'default',
}: {
  value: string;
  tone?: 'default' | 'positive' | 'warning';
}) {
  return (
    <div
      className={cn(
        'text-3xl font-semibold tabular-nums tracking-tight',
        tone === 'positive' && 'text-emerald-700 dark:text-emerald-400',
        tone === 'warning' && 'text-amber-700 dark:text-amber-400',
        tone === 'default' && 'text-foreground',
      )}
    >
      {value}
    </div>
  );
}

export function Subline({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}

export function QuietEmpty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}
