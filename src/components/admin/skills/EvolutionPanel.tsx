import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench } from 'lucide-react';

/**
 * Self-created skills — the one evolution surface with a source of its own
 * (`agent_skills.origin = 'agent'`). Soul and identity live under Behaviour →
 * Voice and rules, learnings in the memory browser above; the reflect /
 * soul_update / memory_write / skill_instruct feeds read journal rows those
 * built-in tools never write, so they were always empty and are gone.
 */
export function EvolutionPanel() {
  const { data: selfCreatedSkills = [], isLoading } = useQuery({
    queryKey: ['evolution-self-skills'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_skills')
        .select('*')
        .eq('origin', 'agent')
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Self-Created Skills
        </CardTitle>
        <CardDescription>Skills created autonomously by FlowPilot</CardDescription>
      </CardHeader>
      <CardContent>
        {selfCreatedSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No self-created skills yet.</p>
        ) : (
          <div className="space-y-2">
            {selfCreatedSkills.map((skill) => (
              <div key={skill.id} className="flex items-start justify-between p-2 rounded-md bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{skill.name}</p>
                  <p className="text-xs text-muted-foreground">{skill.description}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={skill.enabled ? 'default' : 'secondary'} className="text-xs">
                    {skill.enabled ? 'Active' : 'Pending'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
