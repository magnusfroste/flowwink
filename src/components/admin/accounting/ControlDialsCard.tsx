import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { homeCurrency } from '@/lib/platform-fallbacks';
import { useJournalEntryApprovalRule, useSaveJournalEntryApprovalRule } from '@/hooks/useApprovals';

/**
 * The skills whose bookings the "agent bookings" dial governs: every path an
 * operator takes from a bank event or an invoice to a posted voucher.
 */
const AGENT_BOOKING_SKILLS = ['manage_journal_entry', 'post_journal_entry', 'run_bookkeeping_sweep', 'book_unbooked_invoices'] as const;

interface SkillRow { name: string; trust_level: 'auto' | 'notify' | 'approve' }

/**
 * Two dials a person turns once and the whole ledger obeys — the controls
 * Accounted puts on its front page ("Attest från 10 000 kr", "Agentens
 * ändringar väntar på godkännande"): the amount above which a manual journal
 * entry waits for approval, and whether an agent's bookings wait for a person.
 * Both read and write the tables the harness already enforces
 * (approval_rules for journal_entry; agent_skills.trust_level) — no new
 * mechanism, just a visible handle on the existing one.
 */
export function ControlDialsCard() {
  const qc = useQueryClient();
  const { formatCurrency } = usePlatformFormat();

  // The approvals module owns the rule: its hook reads and writes it.
  const { data: rule } = useJournalEntryApprovalRule();
  const saveRule = useSaveJournalEntryApprovalRule();

  const { data: skills = [] } = useQuery({
    queryKey: ['agent-skills', 'booking-dial'],
    queryFn: async (): Promise<SkillRow[]> => {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('name, trust_level')
        .in('name', [...AGENT_BOOKING_SKILLS]);
      if (error) throw error;
      return (data ?? []) as SkillRow[];
    },
  });

  const [requireApproval, setRequireApproval] = useState(false);
  const [thresholdMajor, setThresholdMajor] = useState('');
  useEffect(() => {
    if (rule === undefined) return;
    setRequireApproval(!!rule?.is_active);
    setThresholdMajor(rule?.amount_threshold_cents != null ? String(rule.amount_threshold_cents / 100) : '');
  }, [rule]);

  const saveThreshold = useMutation({
    mutationFn: async () => {
      const cents = thresholdMajor.trim() ? Math.round(parseFloat(thresholdMajor.replace(',', '.')) * 100) : null;
      if (requireApproval && (cents === null || !Number.isFinite(cents) || cents < 0)) {
        throw new Error('Enter the amount above which a manual entry needs approval');
      }
      await saveRule.mutateAsync({ rule: rule ?? null, amountCents: cents, active: requireApproval, currency: homeCurrency() });
    },
    onSuccess: () => {
      toast.success(requireApproval ? 'Approval threshold saved' : 'Manual entries no longer wait for approval');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bookingMode: 'approve' | 'notify' | 'mixed' | 'unknown' = skills.length === 0
    ? 'unknown'
    : skills.every((s) => s.trust_level === 'approve') ? 'approve'
    : skills.every((s) => s.trust_level !== 'approve') ? 'notify'
    : 'mixed';

  const setBookingMode = useMutation({
    mutationFn: async (mode: 'approve' | 'notify') => {
      // trust_level and requires_staging move together (useUpsertSkill does
      // the same): "wait for approval" is the staged envelope plus a person.
      const { error } = await supabase
        .from('agent_skills')
        .update({ trust_level: mode, requires_staging: mode === 'approve' })
        .in('name', [...AGENT_BOOKING_SKILLS]);
      if (error) throw error;
    },
    onSuccess: (_d, mode) => {
      toast.success(mode === 'approve' ? 'Agent bookings now wait for a person' : 'Agent bookings are posted directly and logged');
      qc.invalidateQueries({ queryKey: ['agent-skills'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          Control dials
        </CardTitle>
        <CardDescription>
          What must pass a person before it is in the books. Both dials are the approval rules and the
          trust levels the platform already enforces — this is the handle, not a second mechanism.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="dial-approval" className="text-sm">Manual journal entries need approval above an amount</Label>
              <p className="text-xs text-muted-foreground mt-1">
                An entry above the threshold is held as a draft with an approval request until someone approves and posts it.
                Automatic bookings (orders, invoices, the sweep) are not held.
              </p>
            </div>
            <Switch id="dial-approval" checked={requireApproval} onCheckedChange={setRequireApproval} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div className="space-y-1">
              <Label htmlFor="dial-threshold" className="text-xs">Threshold ({rule?.currency ?? homeCurrency()})</Label>
              <Input
                id="dial-threshold"
                inputMode="decimal"
                value={thresholdMajor}
                disabled={!requireApproval}
                placeholder="e.g. 10000"
                onChange={(e) => setThresholdMajor(e.target.value)}
              />
              {requireApproval && thresholdMajor.trim() && Number.isFinite(parseFloat(thresholdMajor.replace(',', '.'))) && (
                <p className="text-xs text-muted-foreground">
                  Entries above {formatCurrency(Math.round(parseFloat(thresholdMajor.replace(',', '.')) * 100))} wait for approval.
                </p>
              )}
            </div>
            <Button size="sm" onClick={() => saveThreshold.mutate()} disabled={saveThreshold.isPending}>Save</Button>
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label className="text-sm">Agent bookings</Label>
          <p className="text-xs text-muted-foreground">
            What happens when FlowPilot or an external agent books a bank event or an invoice.
            Applies to {AGENT_BOOKING_SKILLS.join(', ')}.
          </p>
          <Select
            value={bookingMode === 'approve' || bookingMode === 'notify' ? bookingMode : undefined}
            onValueChange={(v) => setBookingMode.mutate(v as 'approve' | 'notify')}
            disabled={bookingMode === 'unknown' || setBookingMode.isPending}
          >
            <SelectTrigger className="sm:max-w-md">
              <SelectValue placeholder={bookingMode === 'mixed' ? 'Mixed — pick one to align the four skills' : 'Loading…'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="notify">Book directly, log every booking</SelectItem>
              <SelectItem value="approve">Wait for a person — every booking is staged and approved first</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
