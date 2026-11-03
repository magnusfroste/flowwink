import { useEffect, type ReactNode, type DragEvent } from 'react';
import { useSidebar } from '@/components/ui/sidebar';

/**
 * The frame FlowChat and Flowwork share — one layout, two assistants.
 *
 *   ┌▪┬ sessions ┬──────────── chat column ─────────────┬ panel ───────┐
 *   │▪│ (left)   │ header: icon · title      · actions  │ overview /   │
 *   │▪│          │ body: hero or messages + composer    │ output open  │
 *    ↑ the admin menu folds to icons while you chat
 *
 * Sessions on the left, where Claude and ChatGPT keep them; the admin menu
 * folds to its icon rail on the way in (the pinned pages in the top bar
 * still switch pages in one click), so the right side is free for the
 * session's overview and its outputs (design: flowchat-flowwork-layout,
 * 2026-10-30). Both pages used to build this frame themselves and drifted.
 */
export function ChatShell({
  icon,
  title,
  mobileSessions,
  actions,
  sessions,
  aside,
  children,
  onDrop,
}: {
  icon: ReactNode;
  title: string;
  /** The session picker shown in the header on phones (the aside is desktop-only). */
  mobileSessions?: ReactNode;
  actions?: ReactNode;
  /** The chat history, left of the conversation (desktop). */
  sessions?: ReactNode;
  /** Usually <ChatSidePanel …/>: the session's overview and its outputs. */
  aside?: ReactNode;
  children: ReactNode;
  onDrop?: (e: DragEvent) => void;
}) {
  // Fold the admin menu to icons on the way in. Each admin page mounts its
  // own layout, so leaving the chat brings the menu back as it was; expanding
  // it while chatting is respected — this runs once, on arrival.
  const { open, setOpen, isMobile } = useSidebar();
  useEffect(() => {
    if (!isMobile && open) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    // AdminLayout pads its <main> with p-8; the chat runs edge to edge and
    // fills exactly the main's height (100% + the 2×2rem padding taken back).
    <div
      className="-m-8 flex h-[calc(100%+4rem)] min-h-0 bg-background"
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
    >
      {sessions}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border/40 px-4 md:px-6 py-2.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              {icon}
              <span className="text-sm font-medium">{title}</span>
            </div>
            {mobileSessions && <div className="md:hidden">{mobileSessions}</div>}
          </div>
          {actions && <div className="flex items-center gap-1.5 flex-wrap justify-end">{actions}</div>}
        </div>
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
      </div>
      {aside}
    </div>
  );
}

/** The hero of an empty chat: icon, question, line — the composer goes in `children`. */
export function ChatHero({ icon, heading, lead, children }: { icon: ReactNode; heading: string; lead: ReactNode; children: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-16 overflow-y-auto">
      <div className="w-full max-w-2xl space-y-8 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            {icon}
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground md:text-4xl">{heading}</h1>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">{lead}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The composer's place under a running conversation. */
export function ChatComposerBar({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-border/40 bg-background/80 backdrop-blur px-4 py-3 shrink-0">
      <div className="max-w-3xl mx-auto w-full">{children}</div>
    </div>
  );
}
