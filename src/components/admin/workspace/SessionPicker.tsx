import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { History, MessageSquarePlus, Trash2, Pencil } from 'lucide-react';
import type { WorkspaceSession } from '@/hooks/useWorkspaceSessions';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface Props {
  sessions: WorkspaceSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function SessionPicker({ sessions, activeId, onSelect, onNew, onRename, onDelete }: Props) {
  const [renameTarget, setRenameTarget] = useState<WorkspaceSession | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const active = sessions.find((s) => s.id === activeId);
  const label = active?.title || 'Recent chats';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 max-w-[200px]">
            <History className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-xs">{label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuItem onClick={onNew} className="gap-2">
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Recent
          </DropdownMenuLabel>
          {sessions.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No saved chats yet
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-1 px-1 py-0.5 rounded-sm ${
                  s.id === activeId ? 'bg-muted' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex-1 min-w-0 text-left px-2 py-1.5 text-xs hover:bg-muted/60 rounded-sm"
                >
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
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
                  className="h-6 w-6 text-destructive"
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
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  );
}
