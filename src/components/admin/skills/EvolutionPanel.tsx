import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain,
  Sparkles,
  BookOpen,
  Heart,
  Activity,
  Clock,
  Lightbulb,
  Wrench,
  RefreshCw,
  Info,
} from 'lucide-react';

// --- Data hooks ---

function useEvolutionData() {
  // Learnings from agent_memory
  const learnings = useQuery({
    queryKey: ['evolution-learnings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_memory')
        .select('*')
        .or('key.ilike.%learning_%,key.ilike.%reflection_%,key.ilike.%insight_%')
        .order('updated_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  // Soul/Identity entries
  const soul = useQuery({
    queryKey: ['evolution-soul'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_memory')
        .select('*')
        .in('key', ['soul', 'identity'])
        .order('updated_at', { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  // Self-created skills (origin = 'agent')
  const selfCreatedSkills = useQuery({
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

  // Recent heartbeat/autonomous activity
  const heartbeatActivity = useQuery({
    queryKey: ['evolution-heartbeat'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_activity')
        .select('*')
        .eq('agent', 'flowpilot')
        .in('skill_name', ['reflect', 'soul_update', 'skill_create', 'skill_update', 'skill_instruct', 'memory_write'])
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  // Instruction rewrites
  const instructionRewrites = useQuery({
    queryKey: ['evolution-rewrites'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_activity')
        .select('*')
        .eq('skill_name', 'skill_instruct')
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  return {
    learnings: learnings.data || [],
    soul: soul.data || [],
    selfCreatedSkills: selfCreatedSkills.data || [],
    heartbeatActivity: heartbeatActivity.data || [],
    instructionRewrites: instructionRewrites.data || [],
    isLoading: learnings.isLoading || soul.isLoading || selfCreatedSkills.isLoading,
  };
}

// --- Components ---

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
      <Icon className="h-8 w-8 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function TimeAgo({ date }: { date: string }) {
  return (
    <span className="text-xs text-muted-foreground" title={format(new Date(date), 'PPpp')}>
      {formatDistanceToNow(new Date(date), { addSuffix: true })}
    </span>
  );
}

function extractValue(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    // Try common fields
    return (v.summary as string) || (v.insight as string) || (v.learning as string) || (v.content as string) || (v.text as string) || JSON.stringify(v).slice(0, 200);
  }
  return String(value);
}

export function EvolutionPanel() {
  const {
    learnings,
    soul,
    selfCreatedSkills,
    heartbeatActivity,
    instructionRewrites,
    isLoading,
  } = useEvolutionData();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading evolution data…</p>;
  }

  const hasAnyData = learnings.length > 0 || soul.length > 0 || selfCreatedSkills.length > 0 || heartbeatActivity.length > 0;

  if (!hasAnyData) {
    return (
      <EmptyState
        icon={Brain}
        text="No evolution data yet. FlowPilot will populate this as it learns and reflects."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Evolution tracks how FlowPilot learns and improves over time — refining its soul,
          creating new skills, and rewriting its own instructions based on real performance data.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
      {/* Learnings & Reflections */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Learnings & Reflections
          </CardTitle>
          <CardDescription>
            Insights distilled from data analysis and autonomous reflection
          </CardDescription>
        </CardHeader>
        <CardContent>
          {learnings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No learnings recorded yet. The daily learning loop (03:00 UTC) and heartbeat reflections will populate this.</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {learnings.map((mem) => (
                  <div key={mem.id} className="space-y-1 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium font-mono text-muted-foreground">{mem.key}</p>
                      <TimeAgo date={mem.updated_at} />
                    </div>
                    <p className="text-sm">{extractValue(mem.value)}</p>
                    <Badge variant="outline" className="text-xs">{mem.category}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Soul & Identity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="h-4 w-4" />
            Soul & Identity
          </CardTitle>
          <CardDescription>
            Agent personality, values, and boundaries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {soul.length === 0 ? (
            <p className="text-sm text-muted-foreground">No soul/identity entries yet.</p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-3">
                {soul.map((mem) => (
                  <div key={mem.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium font-mono">{mem.key}</p>
                      <TimeAgo date={mem.updated_at} />
                    </div>
                    <p className="text-sm text-muted-foreground">{extractValue(mem.value)}</p>
                    {mem !== soul[soul.length - 1] && <Separator className="mt-2" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Self-Created Skills */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Self-Created Skills
          </CardTitle>
          <CardDescription>
            Skills created autonomously by FlowPilot
          </CardDescription>
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

      {/* Instruction Rewrites */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Instruction Rewrites
          </CardTitle>
          <CardDescription>
            Skills whose instructions were improved by the agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {instructionRewrites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No instruction rewrites yet.</p>
          ) : (
            <ScrollArea className="max-h-[250px]">
              <div className="space-y-2">
                {instructionRewrites.map((act) => {
                  const input = act.input as Record<string, unknown> | null;
                  const skillName = input?.skill_name || input?.name || 'Unknown';
                  return (
                    <div key={act.id} className="flex items-start justify-between p-2 rounded-md bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{String(skillName)}</p>
                        <TimeAgo date={act.created_at} />
                      </div>
                      <Badge
                        variant={act.status === 'success' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {act.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Evolution Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Evolution Activity
          </CardTitle>
          <CardDescription>
            Self-improvement actions: reflect, learn, create, instruct
          </CardDescription>
        </CardHeader>
        <CardContent>
          {heartbeatActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evolution activity yet.</p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1.5">
                {heartbeatActivity.map((act) => (
                  <div key={act.id} className="flex items-center gap-2 p-1.5 rounded text-sm">
                    <SkillIcon name={act.skill_name || ''} />
                    <span className="font-medium truncate">{act.skill_name}</span>
                    <Badge
                      variant={act.status === 'success' ? 'outline' : 'destructive'}
                      className="text-xs ml-auto shrink-0"
                    >
                      {act.status}
                    </Badge>
                    <TimeAgo date={act.created_at} />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SkillIcon({ name }: { name: string }) {
  const iconMap: Record<string, React.ElementType> = {
    reflect: RefreshCw,
    soul_update: Heart,
    skill_create: Sparkles,
    skill_update: Wrench,
    skill_instruct: BookOpen,
    memory_write: Brain,
  };
  const Icon = iconMap[name] || Clock;
  return <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}
