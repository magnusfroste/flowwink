import { useState, useEffect } from 'react';
import { Zap, Timer, Save, Loader2, Cpu, ExternalLink, Info } from 'lucide-react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ObjectivesPanel } from '@/components/admin/skills/ObjectivesPanel';
import { AutomationsPanel } from '@/components/admin/skills/AutomationsPanel';
import { AutomationHealthPanel } from '@/components/admin/skills/AutomationHealthPanel';
import { SystemIntegrityPanel } from '@/components/admin/skills/SystemIntegrityPanel';
import { EvolutionPanel } from '@/components/admin/skills/EvolutionPanel';
import { WorkflowsPanel } from '@/components/admin/skills/WorkflowsPanel';
import { SelfHealingAlert } from '@/components/admin/skills/SelfHealingAlert';
import { AutonomyScheduleTab } from '@/components/admin/AutonomyScheduleTab';
import { useSkills } from '@/hooks/useSkillHub';
import {
  useAutonomyScheduleSettings,
  useUpdateAutonomyScheduleSettings,
  AutonomyScheduleSettings,
  defaultAutonomyScheduleSettings,
} from '@/hooks/useSiteSettings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * FlowPilot Engine — internal control room for the FlowPilot module.
 *
 * Skills + MCP exposure live under /admin/developer (platform layer). This page
 * is FlowPilot-specific: objectives, automations, workflows, evolution, autonomy
 * schedule and FlowPilot's health view.
 *
 * See docs/architecture/mcp-as-platform.md for the decoupling rationale.
 */
export default function SkillHubPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'objectives';

  const { data: skills = [] } = useSkills();
  const exposedCount = skills.filter((s) => s.mcp_exposed).length;

  // Autonomy schedule
  const { data: autonomySettings } = useAutonomyScheduleSettings();
  const updateAutonomy = useUpdateAutonomyScheduleSettings();
  const [autonomyData, setAutonomyData] = useState<AutonomyScheduleSettings>(defaultAutonomyScheduleSettings);
  const [autonomySaving, setAutonomySaving] = useState(false);

  useEffect(() => {
    if (autonomySettings) setAutonomyData(autonomySettings);
  }, [autonomySettings]);

  const handleSaveAutonomy = async () => {
    setAutonomySaving(true);
    try {
      await updateAutonomy.mutateAsync(autonomyData);
      await supabase.functions.invoke('update-autonomy-cron');
      toast.success('Autonomy schedule saved');
    } catch {
      toast.error('Failed to save autonomy schedule');
    } finally {
      setAutonomySaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Self-healing alerts */}
        <SelfHealingAlert />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">FlowPilot Engine</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Internal control room for the FlowPilot module — objectives, automations,
              workflows and autonomous loops.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {exposedCount} skills exposed
            </Badge>
            <Button
              variant="outline" size="sm" className="gap-1.5" asChild
            >
              <Link to="/admin/developer?tab=mcp-skills">
                <Cpu className="h-3.5 w-3.5" />
                MCP Skills
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Link>
            </Button>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => navigate('/admin/flowpilot')}
            >
              <Zap className="h-3.5 w-3.5" />
              Open FlowPilot
            </Button>
          </div>
        </div>

        {/* Decoupling banner */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle className="text-sm">Skills & MCP exposure moved to Developer</AlertTitle>
          <AlertDescription className="text-xs">
            The skills catalog and MCP exposure toggles are now under{' '}
            <Link to="/admin/developer?tab=mcp-skills" className="underline font-medium">
              Developer → MCP Skills
            </Link>
            . FlowPilot consumes the same catalog as external MCP clients (OpenClaw,
            ClawWink, Claude Desktop) — turning FlowPilot off does not hide skills from MCP.
          </AlertDescription>
        </Alert>

        {/* Tabs */}
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="objectives">Objectives</TabsTrigger>
            <TabsTrigger value="automations">Automations</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="evolution">Evolution</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="autonomy" className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              Autonomy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="objectives">
            <ObjectivesPanel />
          </TabsContent>

          <TabsContent value="automations">
            <AutomationsPanel />
          </TabsContent>

          <TabsContent value="workflows">
            <WorkflowsPanel />
          </TabsContent>

          <TabsContent value="evolution">
            <EvolutionPanel />
          </TabsContent>

          <TabsContent value="health" className="space-y-6">
            <SystemIntegrityPanel />
            <AutomationHealthPanel />
          </TabsContent>

          <TabsContent value="autonomy" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Autonomy Schedule</h2>
                <p className="text-sm text-muted-foreground">Configure when FlowPilot runs its autonomous loops.</p>
              </div>
              <Button onClick={handleSaveAutonomy} disabled={autonomySaving} size="sm">
                {autonomySaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save schedule
              </Button>
            </div>
            <AutonomyScheduleTab data={autonomyData} onChange={setAutonomyData} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
