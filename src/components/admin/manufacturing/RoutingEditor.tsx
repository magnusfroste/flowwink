import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useRoutingOperations,
  useManageRoutingOperation,
  useWorkCenters,
  type RoutingOperation,
} from '@/hooks/useManufacturing';
import { logger } from '@/lib/logger';

interface DraftOp {
  key: string;
  id?: string;
  sequence: number;
  name: string;
  work_center_id: string;
  duration_minutes: number;
  dirty?: boolean;
}

function toDraft(op: RoutingOperation): DraftOp {
  return {
    key: op.id,
    id: op.id,
    sequence: op.sequence,
    name: op.name,
    work_center_id: op.work_center_id,
    duration_minutes: op.duration_minutes,
  };
}

export function RoutingEditor({ bomId }: { bomId: string }) {
  const { data: ops, isLoading } = useRoutingOperations(bomId);
  const { data: workCenters = [] } = useWorkCenters();
  const manage = useManageRoutingOperation();

  const [drafts, setDrafts] = useState<DraftOp[]>([]);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Hydrate drafts from server whenever the ops list changes (new bomId or refetch).
  if (ops && hydratedFor !== `${bomId}:${ops.map((o) => o.id).join(',')}`) {
    setDrafts(ops.map(toDraft));
    setHydratedFor(`${bomId}:${ops.map((o) => o.id).join(',')}`);
  }

  function updateDraft(key: string, patch: Partial<DraftOp>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch, dirty: true } : d)));
  }

  function addRow() {
    const nextSeq = (drafts[drafts.length - 1]?.sequence ?? 0) + 10;
    setDrafts((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        sequence: nextSeq,
        name: '',
        work_center_id: workCenters[0]?.id ?? '',
        duration_minutes: 15,
        dirty: true,
      },
    ]);
  }

  async function saveRow(draft: DraftOp) {
    if (!draft.name || !draft.work_center_id) return;
    try {
      if (draft.id) {
        await manage.mutateAsync({
          p_action: 'update',
          p_id: draft.id,
          p_sequence: draft.sequence,
          p_name: draft.name,
          p_work_center_id: draft.work_center_id,
          p_duration_minutes: draft.duration_minutes,
        });
      } else {
        await manage.mutateAsync({
          p_action: 'create',
          p_bom_id: bomId,
          p_sequence: draft.sequence,
          p_name: draft.name,
          p_work_center_id: draft.work_center_id,
          p_duration_minutes: draft.duration_minutes,
        });
      }
      setHydratedFor(null); // force rehydrate from refetch
    } catch (err) {
      logger.error('Save routing operation failed', err);
    }
  }

  async function deleteRow(draft: DraftOp) {
    if (!draft.id) {
      setDrafts((prev) => prev.filter((d) => d.key !== draft.key));
      return;
    }
    try {
      await manage.mutateAsync({ p_action: 'delete', p_id: draft.id });
      setHydratedFor(null);
    } catch (err) {
      logger.error('Delete routing operation failed', err);
    }
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Routing</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addRow}
          disabled={workCenters.length === 0}
        >
          <Plus className="mr-1 h-4 w-4" /> Add operation
        </Button>
      </div>

      {workCenters.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add a work center first (Manufacturing → Work Centers) to define operations.
        </p>
      )}

      {drafts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No operations yet.</p>
      ) : (
        <div className="space-y-2">
          {drafts.map((d, idx) => (
            <div
              key={d.key}
              className="grid gap-2 rounded-md border p-3 md:grid-cols-[70px_1fr_1fr_90px_auto_auto] md:items-end"
            >
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Seq</Label>
                <Input
                  type="number"
                  value={d.sequence}
                  onChange={(e) => updateDraft(d.key, { sequence: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Operation {idx + 1} *</Label>
                <Input
                  value={d.name}
                  placeholder="Cut, assemble, QC…"
                  onChange={(e) => updateDraft(d.key, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Work center *</Label>
                <Select
                  value={d.work_center_id}
                  onValueChange={(v) => updateDraft(d.key, { work_center_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a work center" />
                  </SelectTrigger>
                  <SelectContent>
                    {workCenters.map((wc) => (
                      <SelectItem key={wc.id} value={wc.id}>
                        {wc.code} — {wc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Min / unit</Label>
                <Input
                  type="number"
                  min={0}
                  value={d.duration_minutes}
                  onChange={(e) => updateDraft(d.key, { duration_minutes: Number(e.target.value) })}
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={!d.dirty || manage.isPending || !d.name || !d.work_center_id}
                onClick={() => saveRow(d)}
                aria-label="Save operation"
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => deleteRow(d)}
                disabled={manage.isPending}
                aria-label="Delete operation"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
