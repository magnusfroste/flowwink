import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContextTab {
  id: string;
  label: string;
  icon: LucideIcon;
  /** A count beside the label (e.g. sources cited in this chat). */
  count?: number;
  content: ReactNode;
}

/**
 * The right side of a chat: what belongs to THIS conversation.
 *
 * Sessions when nothing else is open; the sources when a citation is
 * clicked; later the Result of a run (a page, a post, a table to review —
 * FlowWink's artifacts) and its Why. In Claude and ChatGPT the right side
 * is where output appears, so it is where people look; here it keeps the
 * history too, because the left is the admin navigation
 * (design: flowchat-flowwork-layout, 2026-10-30). One panel, tabs — not a
 * drawer sliding over the chat.
 */
export function ContextAside({
  tabs,
  active,
  onActiveChange,
}: {
  tabs: ContextTab[];
  active: string;
  onActiveChange: (id: string) => void;
}) {
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <aside className="hidden md:flex flex-col border-l border-border/40 bg-muted/20 shrink-0 w-80">
      <div role="tablist" className="flex items-center gap-1 px-2 py-1.5 border-b border-border/40 shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onActiveChange(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
                on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="flex-1 min-h-0 overflow-y-auto">{current?.content}</div>
    </aside>
  );
}
