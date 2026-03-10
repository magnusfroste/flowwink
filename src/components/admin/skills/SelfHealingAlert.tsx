import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldAlert, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export function SelfHealingAlert() {
  const queryClient = useQueryClient();

  const { data: disabledSkills = [] } = useQuery({
    queryKey: ['self-healed-skills'],
    queryFn: async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const { data } = await supabase
        .from('agent_activity')
        .select('skill_name, created_at')
        .eq('status', 'failed')
        .gte('created_at', threeDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (!data?.length) return [];

      const streaks: Record<string, number> = {};
      const checked = new Set<string>();
      for (const a of data) {
        const name = a.skill_name;
        if (!name || checked.has(name)) continue;
        if (streaks[name] === undefined) streaks[name] = 0;
        streaks[name]++;
        if (streaks[name] >= 3) checked.add(name);
      }

      const candidates = Object.entries(streaks).filter(([, c]) => c >= 3).map(([n]) => n);
      if (!candidates.length) return [];

      const { data: skills } = await supabase
        .from('agent_skills')
        .select('id, name, description')
        .eq('enabled', false)
        .in('name', candidates);

      return skills || [];
    },
    refetchInterval: 60_000,
  });

  const reEnableSkill = useMutation({
    mutationFn: async (skillName: string) => {
      const { error } = await supabase
        .from('agent_skills')
        .update({ enabled: true })
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
          {disabledSkills.length} skill{disabledSkills.length > 1 ? 's were' : ' was'} auto-disabled due to repeated failures:
        </p>
        <div className="flex flex-wrap gap-2">
          {disabledSkills.map((s: any) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs border-destructive/30">
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
