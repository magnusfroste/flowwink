import { useState } from 'react';
import { ChevronDown, Columns3, Eye, EyeOff, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FlowtableField } from '@/hooks/useFlowtable';

/**
 * Discreet column manager: order + visibility live behind one small toolbar
 * button so the grid itself stays free of chrome. Nothing here edits data —
 * order is a table-level schema position, visibility a per-viewer preference.
 */
export function FieldsMenu({
  fields,
  hidden,
  onToggleHidden,
  onSetHidden,
  onReorder,
}: {
  fields: FlowtableField[];
  hidden: Set<string>;
  onToggleHidden: (id: string) => void;
  onSetHidden: (ids: string[]) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const hiddenCount = fields.filter((f) => hidden.has(f.id)).length;

  const move = (from: string, to: string) => {
    if (from === to) return;
    const ids = fields.map((f) => f.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
    onReorder(ids);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={hiddenCount > 0 ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 px-2 gap-1 text-xs"
          title="Column order and visibility"
        >
          <Columns3 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {hiddenCount > 0 ? `${hiddenCount} hidden` : 'Columns'}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="px-1 pb-1.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Drag to reorder</span>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onSetHidden([])}
            >
              Show all
            </button>
          )}
        </div>
        <div className="max-h-72 overflow-auto">
          {fields.map((f) => {
            const isHidden = hidden.has(f.id);
            return (
              <div
                key={f.id}
                draggable
                onDragStart={() => setDragId(f.id)}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={(e) => { e.preventDefault(); setOverId(f.id); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) move(dragId, f.id);
                  setDragId(null);
                  setOverId(null);
                }}
                className={`flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm cursor-grab ${
                  overId === f.id && dragId && dragId !== f.id ? 'bg-accent' : 'hover:bg-muted/60'
                } ${dragId === f.id ? 'opacity-50' : ''}`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className={`flex-1 min-w-0 truncate ${isHidden ? 'text-muted-foreground' : ''}`}>
                  {f.name}
                </span>
                <span className="text-[10px] uppercase text-muted-foreground shrink-0">{f.type}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title={isHidden ? 'Show column' : 'Hide column'}
                  onClick={() => onToggleHidden(f.id)}
                >
                  {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
          {fields.length === 0 && (
            <p className="px-1.5 py-2 text-xs text-muted-foreground">No columns yet.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
