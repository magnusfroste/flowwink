import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
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
import { useSkills, useToggleSkill, useUpsertSkill, useDeleteSkill } from '@/hooks/useSkillHub';
import type { AgentSkill } from '@/types/agent';

export default function SkillHubPage() {
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skill Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage agent skills, monitor activity, and define objectives.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {skills.length} skills
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="skills">
        <TabsList>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="objectives" disabled>
            Objectives
          </TabsTrigger>
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

        {/* Objectives Tab (placeholder) */}
        <TabsContent value="objectives">
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">Coming soon</p>
            <p className="text-sm mt-1">
              Define high-level goals that decompose into automated skill executions.
            </p>
          </div>
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
  );
}
