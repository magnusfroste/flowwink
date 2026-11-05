import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldAlert, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export function SelfHealingAlert() {
  const queryClient = useQueryClient();

  // What the platform quarantined — read from the row itself
  // (quarantined_at, 20261105100000), not re-derived from activity streaks:
  // self-healing counts only skill faults, and FlowPilot's skill_disable
  // quarantines too. An instance without the column shows nothing.
  const { data: disabledSkills = [] } = useQuery({
    queryKey: ['self-healed-skills'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('id, name, description, quarantine_reason, quarantined_at')
        .eq('enabled', false)
        .not('quarantined_at', 'is', null)
        .order('quarantined_at', { ascending: false });
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const reEnableSkill = useMutation({
    mutationFn: async (skillName: string) => {
      // Back in the catalog: enabling lifts the quarantine (trigger), and
      // the skill sync restores a seed's declared mcp_exposed:false.
      const { error } = await supabase
        .from('agent_skills')
        .update({ enabled: true, mcp_exposed: true })
        .eq('name', skillName);
      if (error) throw error;
      await supabase
        .from('agent_automations')
        .update({ enabled: true, last_error: null })
        .eq('skill_name', skillName);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['self-healed-skills'] });
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      toast.success('Skill re-enabled');
    },
    onError: (e: Error) => toast.error('Failed to re-enable', { description: e.message }),
  });

  if (disabledSkills.length === 0) return null;

  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle className="text-sm font-semibold">Self-Healing Alert</AlertTitle>
      <AlertDescription className="mt-1 space-y-2">
        <p className="text-xs">
          {disabledSkills.length} skill{disabledSkills.length > 1 ? 's are' : ' is'} quarantined — out of FlowPilot and the MCP catalog until re-enabled:
        </p>
        <div className="flex flex-wrap gap-2">
          {disabledSkills.map((s: any) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs border-destructive/30" title={s.quarantine_reason ?? undefined}>
                {s.name.replace(/_/g, ' ')}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => reEnableSkill.mutate(s.name)}
                disabled={reEnableSkill.isPending}
              >
                <RotateCcw className="h-3 w-3" /> Re-enable
              </Button>
            </span>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
