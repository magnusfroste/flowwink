/**
 * SkillsCatalogPage — operator-facing global catalog of all agent skills.
 *
 * Purpose: discoverability. "What can my agent do across the whole system?"
 *
 * Read-only. Grouped per module. Searchable. Each row links to:
 *   - "Try in FlowPilot" → opens FlowPilot chat with pre-filled prompt
 *   - "Manage" → Developer → MCP Skills tab (toggles, MCP exposure)
 *
 * For control (enable/disable, MCP exposure, JSON schema): /admin/developer?tab=mcp-skills
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, Cpu, ExternalLink, Filter } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSkills } from '@/hooks/useSkillHub';
import { moduleRegistry } from '@/lib/module-registry';
import { getUnifiedSkillNames } from '@/lib/module-def';
import { useModules } from '@/hooks/useModules';
import { ModuleSkillsSection } from '@/components/admin/modules/ModuleSkillsSection';
import type { ModulesSettings } from '@/hooks/useModules';

type StatusFilter = 'all' | 'enabled' | 'disabled' | 'mcp' | 'ai-task';

export default function SkillsCatalogPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: allSkills = [], isLoading } = useSkills();
  const { data: enabledModules } = useModules();

  // Build per-module skill index
  const modules = useMemo(() => {
    const list = moduleRegistry.list();
    return list
      .map(mod => {
        const skillNames = getUnifiedSkillNames(mod.id as keyof ModulesSettings);
        const skills = allSkills.filter(s => skillNames.includes(s.name));
        const isEnabled = enabledModules
          ? Boolean((enabledModules as unknown as Record<string, { enabled?: boolean }>)[mod.id]?.enabled)
          : true;
        return { ...mod, skills, isEnabled };
      })
      .filter(m => m.skills.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allSkills, enabledModules]);

  // Apply search + status filter
  const filteredModules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules
      .map(mod => ({
        ...mod,
        skills: mod.skills.filter(s => {
          // Status filter
          if (statusFilter === 'enabled' && !s.enabled) return false;
          if (statusFilter === 'disabled' && s.enabled) return false;
          if (statusFilter === 'mcp' && !s.mcp_exposed) return false;
          if (statusFilter === 'ai-task' && !s.handler?.startsWith('ai-task:')) return false;
          // Search filter (name, description, module name)
          if (q) {
            const hay = `${s.name} ${s.description ?? ''} ${mod.name}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        }),
      }))
      .filter(m => m.skills.length > 0);
  }, [modules, search, statusFilter]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = allSkills.length;
    const enabled = allSkills.filter(s => s.enabled).length;
    const exposed = allSkills.filter(s => s.mcp_exposed).length;
    return { total, enabled, exposed, modules: modules.length };
  }, [allSkills, modules]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Skills"
          description="Browse every action your agent can perform — grouped by the module that owns it."
        >
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/developer?tab=mcp-skills">
              <Cpu className="h-3.5 w-3.5 mr-1.5" />
              Manage in Developer
              <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
            </Link>
          </Button>
        </AdminPageHeader>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total skills" value={stats.total} />
          <StatCard label="Enabled" value={stats.enabled} accent="text-green-600" />
          <StatCard label="Exposed via MCP" value={stats.exposed} accent="text-primary" />
          <StatCard label="Modules with skills" value={stats.modules} />
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by skill name, description, or module…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="all" className="text-xs">
                <Filter className="h-3 w-3 mr-1" />
                All
              </TabsTrigger>
              <TabsTrigger value="enabled" className="text-xs">Enabled</TabsTrigger>
              <TabsTrigger value="disabled" className="text-xs">Disabled</TabsTrigger>
              <TabsTrigger value="mcp" className="text-xs gap-1">
                <Cpu className="h-3 w-3" />
                MCP
              </TabsTrigger>
              <TabsTrigger value="ai-task" className="text-xs">ai-task</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Empty / loading */}
        {isLoading && (
          <div className="text-sm text-muted-foreground py-12 text-center">
            Loading skills…
          </div>
        )}
        {!isLoading && filteredModules.length === 0 && (
          <div className="text-sm text-muted-foreground py-12 text-center">
            No skills match your filters.
          </div>
        )}

        {/* Modules with skills */}
        <div className="space-y-4">
          {filteredModules.map(mod => (
            <Card key={mod.id} className={!mod.isEnabled ? 'opacity-70' : undefined}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <h3 className="text-base font-semibold">{mod.name}</h3>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    v{mod.version}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {mod.skills.length} {mod.skills.length === 1 ? 'skill' : 'skills'}
                  </Badge>
                  {!mod.isEnabled && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Module disabled
                    </Badge>
                  )}
                  {mod.description && (
                    <span className="text-xs text-muted-foreground ml-1 hidden md:inline">
                      — {mod.description}
                    </span>
                  )}
                </div>
                {/* Inline read-only list for this module's skills */}
                <ModuleSkillsSection
                  moduleId={mod.id}
                  variant="inline"
                  defaultOpen={true}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className={`text-2xl font-bold ${accent ?? ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
