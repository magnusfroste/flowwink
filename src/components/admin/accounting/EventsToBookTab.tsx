import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Loader2, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProposalStatus = 'auto' | 'propose' | 'escalate';

interface ProposedLine {
  account_code: string;
  account_name: string;
  debit_cents: number;
  credit_cents: number;
}

interface Candidate {
  template_id: string;
  name: string;
  confidence: number;
}

interface Proposal {
  bank_transaction_id: string;
  transaction_date: string;
  amount_cents: number;
  counterparty: string;
  description: string;
  status: ProposalStatus;
  confidence: number;
  suggested_template_id: string;
  suggested_template_name: string;
  suggested_amount_cents: number;
  proposed_lines: ProposedLine[];
  top_candidates: Candidate[];
}

interface ProposalsResult {
  proposals: Proposal[];
  summary: { total: number; auto: number; propose: number; escalate: number };
}

const sekFmt = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const sekFmt2 = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtSek(cents: number, decimals = false) {
  const v = cents / 100;
  const abs = Math.abs(v);
  const s = (decimals ? sekFmt2 : sekFmt).format(abs);
  return `${v < 0 ? '−' : ''}${s} kr`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', {
    day: '2-digit',
    month: 'short',
  });
}

async function invokeSkill<T>(skill_name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('agent-execute', {
    body: { skill_name, arguments: args, agent_type: 'flowpilot' },
  });
  if (error) throw error;
  return (data?.result ?? data) as T;
}

export function EventsToBookTab() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, string>>({});
  const [batchMode, setBatchMode] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['events-to-book'],
    queryFn: () => invokeSkill<ProposalsResult>('propose_bookkeeping', {}),
  });

  const proposals = data?.proposals ?? [];
  const summary = data?.summary;

  const selected = useMemo(
    () => proposals.find((p) => p.bank_transaction_id === selectedId) ?? proposals[0] ?? null,
    [proposals, selectedId],
  );

  const bookMutation = useMutation({
    mutationFn: async (p: Proposal) => {
      const templateId = templateOverrides[p.bank_transaction_id] ?? p.suggested_template_id;
      const args: Record<string, unknown> = {
        action: 'create',
        template_id: templateId,
        amount_cents: p.suggested_amount_cents,
        description: p.description,
        reference_number: p.counterparty,
        bank_transaction_id: p.bank_transaction_id,
        auto_confirm: true,
      };
      const first = await invokeSkill<any>('manage_journal_entry', args);
      // If the skill is staged, the human click here IS the approval.
      // Approve the pending op and re-invoke with _approved_operation_id.
      if (first?.staged && first?.operation_id) {
        const { error: approveErr } = await supabase.rpc('approve_pending_operation', {
          p_id: first.operation_id,
        });
        if (approveErr) throw approveErr;
        const finalRes = await invokeSkill<any>('manage_journal_entry', {
          ...args,
          _approved_operation_id: first.operation_id,
        });
        if (!finalRes?.created) {
          throw new Error('Booking did not complete after approval');
        }
        return finalRes as { created: boolean; entry_id: string };
      }
      if (!first?.created) {
        throw new Error('Booking did not complete');
      }
      return first as { created: boolean; entry_id: string };
    },
    onSuccess: () => {
      toast.success('Booked');
      qc.invalidateQueries({ queryKey: ['events-to-book'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function bookSelected() {
    const targets = proposals.filter(
      (p) => p.status === 'auto' && checked[p.bank_transaction_id] !== false,
    );
    let ok = 0;
    for (const p of targets) {
      try {
        await bookMutation.mutateAsync(p);
        ok++;
      } catch {
        /* toast handled */
      }
    }
    toast.success(`Booked ${ok}/${targets.length}`);
    setChecked({});
    refetch();
  }

  const statusBadge = (p: Proposal) => {
    const cls =
      p.status === 'auto'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
        : p.status === 'propose'
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
          : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
    return (
      <Badge variant="outline" className={cn('font-normal text-[11px]', cls)}>
        {p.confidence}%
      </Badge>
    );
  };

  const autoCount = proposals.filter((p) => p.status === 'auto').length;
  const batchTargets = proposals.filter(
    (p) => p.status === 'auto' && checked[p.bank_transaction_id] !== false,
  ).length;

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-foreground">
          Events to book
        </h1>
        {summary && (
          <p className="mt-2 text-sm text-muted-foreground">
            {summary.total} events · {summary.auto} auto · {summary.propose} to review ·{' '}
            {summary.escalate} need template
          </p>
        )}
      </div>

      {/* Batch toggle */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="batch-mode"
            checked={batchMode}
            onCheckedChange={(v) => setBatchMode(v)}
          />
          <Label htmlFor="batch-mode" className="text-sm text-muted-foreground">
            Batch book
          </Label>
        </div>
        {batchMode && autoCount > 0 && (
          <Button
            size="sm"
            onClick={bookSelected}
            disabled={bookMutation.isPending || batchTargets === 0}
          >
            {bookMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
            Book selected ({batchTargets})
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-sm text-destructive">
            Could not load events.
          </div>
        ) : proposals.length === 0 ? (
          <div className="p-16 text-center">
            <Inbox className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Nothing to book right now.</p>
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="min-h-[520px]">
            {/* LEFT: queue */}
            <ResizablePanel defaultSize={55} minSize={35}>
              <div className="divide-y divide-border">
                {proposals.map((p) => {
                  const isSelected = selected?.bank_transaction_id === p.bank_transaction_id;
                  const isChecked = checked[p.bank_transaction_id] !== false;
                  return (
                    <button
                      key={p.bank_transaction_id}
                      type="button"
                      onClick={() => setSelectedId(p.bank_transaction_id)}
                      className={cn(
                        'w-full text-left px-5 py-4 hover:bg-muted/40 transition-colors relative flex items-center gap-4',
                        isSelected && 'bg-muted/60',
                      )}
                    >
                      {isSelected && (
                        <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
                      )}
                      {batchMode && p.status === 'auto' && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(v) =>
                              setChecked((c) => ({
                                ...c,
                                [p.bank_transaction_id]: v === true,
                              }))
                            }
                          />
                        </div>
                      )}
                      <div className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {fmtDate(p.transaction_date)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground truncate">{p.counterparty}</div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {p.suggested_template_name || '—'}
                        </div>
                      </div>
                      <div className="shrink-0">{statusBadge(p)}</div>
                      <div
                        className={cn(
                          'w-28 shrink-0 text-right tabular-nums text-sm',
                          p.amount_cents < 0 ? 'text-foreground' : 'text-emerald-700 dark:text-emerald-400',
                        )}
                      >
                        {fmtSek(p.amount_cents)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* RIGHT: detail */}
            <ResizablePanel defaultSize={45} minSize={30}>
              {selected ? (
                <ProposalDetail
                  key={selected.bank_transaction_id}
                  proposal={selected}
                  templateOverride={templateOverrides[selected.bank_transaction_id]}
                  onTemplateChange={(id) =>
                    setTemplateOverrides((o) => ({
                      ...o,
                      [selected.bank_transaction_id]: id,
                    }))
                  }
                  onBook={() => bookMutation.mutate(selected)}
                  onSkip={() => setSelectedId(null)}
                  isBooking={bookMutation.isPending}
                />
              ) : (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Select an event
                </div>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {isFetching && !isLoading && (
        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Uppdaterar…
        </div>
      )}
    </div>
  );
}

function ProposalDetail({
  proposal,
  templateOverride,
  onTemplateChange,
  onBook,
  onSkip,
  isBooking,
}: {
  proposal: Proposal;
  templateOverride?: string;
  onTemplateChange: (id: string) => void;
  onBook: () => void;
  onSkip: () => void;
  isBooking: boolean;
}) {
  const p = proposal;
  const effectiveTemplateId = templateOverride ?? p.suggested_template_id;
  const effectiveTemplateName =
    p.top_candidates.find((c) => c.template_id === effectiveTemplateId)?.name ??
    p.suggested_template_name;
  const isEscalate = p.status === 'escalate';

  return (
    <div className="p-6 md:p-8 h-full flex flex-col">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          {new Date(p.transaction_date).toLocaleDateString('sv-SE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
        <h2 className="font-serif text-2xl tracking-tight text-foreground">{p.counterparty}</h2>
        {p.description && (
          <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
        )}
      </div>

      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          How it will be booked
        </div>
        {p.proposed_lines.length > 0 ? (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="text-left font-normal px-4 py-2">Account</th>
                  <th className="text-right font-normal px-4 py-2 w-28">Debit</th>
                  <th className="text-right font-normal px-4 py-2 w-28">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.proposed_lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5">
                      <span className="tabular-nums text-muted-foreground mr-2">
                        {l.account_code}
                      </span>
                      <span className="text-foreground">{l.account_name}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">
                      {l.debit_cents ? fmtSek(l.debit_cents, true) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">
                      {l.credit_cents ? fmtSek(l.credit_cents, true) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No proposed booking — pick a template below.
          </p>
        )}
      </div>

      <div className="mb-6">
        {isEscalate ? (
          <p className="text-sm text-foreground">
            No template matched — pick one manually.
          </p>
        ) : (
          <div className="text-sm">
            <span className="text-muted-foreground">Template: </span>
            <span className="text-foreground">{effectiveTemplateName}</span>
            <span className="text-muted-foreground"> · {p.confidence}% confidence</span>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 border-t border-border">
        <Button onClick={onBook} disabled={isBooking || !effectiveTemplateId}>
          {isBooking && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
          Book
        </Button>

        {p.top_candidates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Change template <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {p.top_candidates.map((c) => (
                <DropdownMenuItem
                  key={c.template_id}
                  onSelect={() => onTemplateChange(c.template_id)}
                  className={c.template_id === effectiveTemplateId ? 'bg-accent' : ''}
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 tabular-nums">
                    {c.confidence}%
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button variant="ghost" size="sm" onClick={onSkip} className="ml-auto text-muted-foreground">
          Skip
        </Button>
      </div>
    </div>
  );
}
