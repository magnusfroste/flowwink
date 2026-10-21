import { cn } from '@/lib/utils';
import type { TagGroup } from '@/lib/tag-groups';

/**
 * Rows of small outlined chips with an optional lead-in — "Adapts to your
 * mission: ISR · Interceptor · Strike". Tokens only: the chip border is the
 * current text at low alpha, so it reads on any surface, inverse included.
 */
export function TagGroups({ groups, className }: { groups?: TagGroup[]; className?: string }) {
  const rows = (groups ?? []).filter((g) => g.tags?.length);
  if (rows.length === 0) return null;
  return (
    <div className={cn('space-y-3', className)} data-tag-groups>
      {rows.map((g, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {g.label && <span className="mr-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{g.label}</span>}
          {g.tags.map((t, j) => (
            <span key={j} className="rounded-sm border border-current/30 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider" data-tag>{t}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
