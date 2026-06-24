/**
 * SessionsAside — collapsible right-side panel listing chat sessions.
 *
 * Used by FlowChat (and reusable for other operator chats) so the
 * conversation history sits beside the chat flow without nesting a
 * second SidebarProvider next to the admin sidebar.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  ChevronRight,
  ChevronLeft,
  MessageSquarePlus,
  Pencil,
  Trash2,
  History,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { WorkspaceSession } from '@/hooks/useWorkspaceSessions';
import { cn } from '@/lib/utils';

interface Props {
  sessions: WorkspaceSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Controlled collapsed state; defaults to uncontrolled. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function SessionsAside({
  sessions,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  collapsed: collapsedProp,
  onCollapsedChange,
}: Props) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = collapsedProp ?? internalCollapsed;
  const setCollapsed = (v: boolean) => {
    if (onCollapsedChange) onCollapsedChange(v);
    else setInternalCollapsed(v);
  };

  const [renameTarget, setRenameTarget] = useState<WorkspaceSession | null>(null);
  const [renameValue, setRenameValue] = useState('');

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-l border-border/40 bg-muted/20 shrink-0 transition-[width] duration-200',
        collapsed ? 'w-10' : 'w-72',
      )}
    >
      <div className="flex items-center justify-between gap-1 px-2 py-2 border-b border-border/40 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Show chats' : 'Hide chats'}
        >
          {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        {!collapsed && (
          <>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground truncate">Chats</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onNew}
              title="New chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {sessions.length === 0 ? (
            <div className="px-2 py-6 text-xs text-muted-foreground text-center">
              No saved chats yet
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'group flex items-center gap-0.5 rounded-md px-1 py-0.5',
                  s.id === activeId ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex-1 min-w-0 text-left px-1.5 py-1.5 rounded-sm"
                >
                  <div className="truncate text-xs font-medium">{s.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameTarget(s);
                    setRenameValue(s.title);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${s.title}"?`)) onDelete(s.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Chat title"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameTarget && renameValue.trim()) {
                  onRename(renameTarget.id, renameValue.trim());
                }
                setRenameTarget(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
