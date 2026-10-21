import { Badge } from '@/components/ui/badge';

/**
 * The tags a kanban card carries — at most `max`, the rest as "+n", so a card
 * with eight labels still fits its column. Nothing when there are none.
 */
export function TagChips({ tags, max = 3, className }: { tags?: string[] | null; max?: number; className?: string }) {
  const list = (tags ?? []).filter((t) => typeof t === 'string' && t.trim());
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {shown.map((t) => (
        <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
          {t}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal text-muted-foreground" title={list.slice(max).join(', ')}>
          +{rest}
        </Badge>
      )}
    </div>
  );
}
