import { useState, useMemo } from 'react';
import { Plus, Zap } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkillCard } from '@/components/admin/skills/SkillCard';
import { SkillEditorSheet } from '@/components/admin/skills/SkillEditorSheet';
import { ActivityTable } from '@/components/admin/skills/ActivityTable';
import { ObjectivesPanel } from '@/components/admin/skills/ObjectivesPanel';
import { AutomationsPanel } from '@/components/admin/skills/AutomationsPanel';
import { AutomationHealthPanel } from '@/components/admin/skills/AutomationHealthPanel';
import { EvolutionPanel } from '@/components/admin/skills/EvolutionPanel';
import { WorkflowsPanel } from '@/components/admin/skills/WorkflowsPanel';
import { SelfHealingAlert } from '@/components/admin/skills/SelfHealingAlert';
import { useSkills, useToggleSkill, useUpsertSkill, useDeleteSkill } from '@/hooks/useSkillHub';
import type { AgentSkill } from '@/types/agent';

export default function SkillHubPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'skills';

  const { data: skills = [], isLoading } = useSkills();
  const toggle = useToggleSkill();
  const upsert = useUpsertSkill();
  const remove = useDeleteSkill();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<AgentSkill | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  const filtered = useMemo(() => {
    return skills.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (scopeFilter !== 'all' && s.scope !== scopeFilter) return false;
      return true;
    });
  }, [skills, categoryFilter, scopeFilter]);

  const handleEdit = (skill: AgentSkill) => {
    setEditingSkill(skill);
    setEditorOpen(true);
  };

  const handleNew = () => {
    setEditingSkill(null);
    setEditorOpen(true);
  };

  return (
    <AdminLayout>
    <div className="space-y-6">
      {/* Self-healing alerts */}
      <SelfHealingAlert />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skill Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage agent skills, monitor activity, define objectives, and configure automations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {skills.length} skills
          </Badge>
          <Button 
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => navigate('/admin/flowpilot')}
          >
            <Zap className="h-3.5 w-3.5" />
            Open FlowPilot
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="objectives">Objectives</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="evolution">Evolution</TabsTrigger>
        </TabsList>

        {/* Skills Tab */}
        <TabsContent value="skills" className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="content">Content</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="communication">Communication</SelectItem>
                <SelectItem value="automation">Automation</SelectItem>
                <SelectItem value="search">Search</SelectItem>
                <SelectItem value="analytics">Analytics</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
              </SelectContent>
            </Select>

            <Select value={scopeFilter} onValueChange={setScopeFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="external">External</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <Button onClick={handleNew} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Skill
            </Button>
          </div>

          {/* Grid */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading skills…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No skills found.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onToggle={(id, enabled) => toggle.mutate({ id, enabled })}
                  onEdit={handleEdit}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <ActivityTable />
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health">
          <AutomationHealthPanel />
        </TabsContent>

        {/* Objectives Tab */}
        <TabsContent value="objectives">
          <ObjectivesPanel />
        </TabsContent>

        {/* Automations Tab */}
        <TabsContent value="automations">
          <AutomationsPanel />
        </TabsContent>

        {/* Workflows Tab */}
        <TabsContent value="workflows">
          <WorkflowsPanel />
        </TabsContent>

        {/* Evolution Tab */}
        <TabsContent value="evolution">
          <EvolutionPanel />
        </TabsContent>
      </Tabs>

      {/* Editor */}
      <SkillEditorSheet
        skill={editingSkill}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={(data) => upsert.mutate(data)}
        onDelete={(id) => remove.mutate(id)}
      />
    </div>
    </AdminLayout>
  );
}
