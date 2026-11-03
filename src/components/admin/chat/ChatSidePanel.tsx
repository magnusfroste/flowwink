import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronRight, LayoutList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PanelSection {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Shown beside the title (e.g. "72%", "3 cited"). */
  meta?: ReactNode;
  defaultOpen?: boolean;
  /** Hidden when there is nothing to show (no outputs yet, nothing staged). */
  hidden?: boolean;
  content: ReactNode;
}

/**
 * The right side of a chat — an overview of THIS session, in stacked
 * sections that fold: Context, Sources, Outputs, Changes, Running. All of it
 * visible at once, the way Claude Code's session panel is, instead of tabs
 * to click through. When an output is opened (a document, a post) it takes
 * the whole panel — the artifact — with a way back to the overview.
 *
 * Sessions are not here: they are the chat's history and live on the LEFT,
 * beside the admin menu that folds to icons while you chat (2026-10-30).
 */
export function ChatSidePanel({
  sections,
  focus,
  onCloseFocus,
}: {
  sections: PanelSection[];
  /** An opened output — fills the panel. */
  focus?: { title: string; content: ReactNode } | null;
  onCloseFocus?: () => void;
}) {
  return (
    <aside className={cn(
      'hidden md:flex flex-col border-l border-border/40 bg-muted/20 shrink-0 transition-[width]',
      focus ? 'w-[28rem] xl:w-[34rem]' : 'w-80',
    )}>
      {focus ? (
        <>
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onCloseFocus}>
              <LayoutList className="h-3.5 w-3.5" /> Overview
            </Button>
            <span className="text-xs font-medium truncate">{focus.title}</span>
          </div>
          <div className="flex-1 min-h-0">{focus.content}</div>
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
          {sections.filter((s) => !s.hidden).map((s) => <Section key={s.id} section={s} />)}
        </div>
      )}
    </aside>
  );
}

function Section({ section }: { section: PanelSection }) {
  const [open, setOpen] = useState(section.defaultOpen ?? true);
  const Icon = section.icon;
  return (
    <section className="rounded-lg border border-border/50 bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{section.title}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {section.meta != null && <span className="ml-auto text-[11px] font-normal">{section.meta}</span>}
      </button>
      {open && <div className="px-3 pb-3 text-xs">{section.content}</div>}
    </section>
  );
}
