import { useState } from 'react';
import { DoorOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Knocker } from '@/hooks/useMeetLobby';

type Translate = (key: string, fallback: string) => string;

/**
 * The host's view of the waiting room: who is at the door, two answers each.
 * A strip above the stage, not a dialog — the host is mid-consultation and
 * finishes it first; the next person waits, and knows they are waiting.
 */
export function WaitingList({ waiting, onAdmit, onDeny, t }: { waiting: Knocker[]; onAdmit: (knockId: string) => Promise<void>; onDeny: (knockId: string) => Promise<void>; t: Translate }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (waiting.length === 0) return null;
  const act = async (knockId: string, fn: (id: string) => Promise<void>) => {
    setBusy(knockId);
    try { await fn(knockId); } finally { setBusy(null); }
  };
  return (
    <div className="rounded-xl border border-border bg-background/95 backdrop-blur shadow-sm divide-y divide-border" data-testid="waiting-list" role="status" aria-live="polite">
      {waiting.map((k) => (
        <div key={k.knockId} className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0" aria-hidden>{k.name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{k.name}</div>
            <div className="text-xs text-muted-foreground">{t('meet.wantsToJoin', 'wants to join')}</div>
          </div>
          <Button size="sm" variant="outline" disabled={busy === k.knockId} onClick={() => act(k.knockId, onDeny)}>{t('meet.notNow', 'Not now')}</Button>
          <Button size="sm" disabled={busy === k.knockId} onClick={() => act(k.knockId, onAdmit)} className="gap-1.5" aria-label={t('meet.letInName', 'Let {name} in').replace('{name}', k.name)}>
            {busy === k.knockId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DoorOpen className="h-3.5 w-3.5" />}
            {t('meet.letIn', 'Let in')}
          </Button>
        </div>
      ))}
    </div>
  );
}
