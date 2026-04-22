import { useState, useMemo } from 'react';
import { Search, Shield, ShieldOff, Loader2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useSkills, useToggleSkill, useToggleMcpExposed, useBulkToggleSkills } from '@/hooks/useSkillHub';
import type { AgentSkill } from '@/types/agent';

const CATEGORY_TO_MODULES: Record<string, string[]> = {
  content: ['pages', 'blog', 'knowledgeBase', 'handbook', 'resume', 'mediaLibrary', 'siteMigration'],
  crm: ['leads', 'deals', 'companies', 'forms', 'bookings', 'hr', 'recruitment', 'projects', 'salesIntelligence', 'tickets'],
  communication: ['newsletter', 'chat', 'liveSupport', 'webinars'],
  commerce: ['ecommerce', 'accounting', 'expenses', 'contracts', 'inventory', 'purchasing', 'invoicing', 'timesheets'],
  analytics: ['analytics', 'sla'],
  growth: ['paidGrowth'],
  search: ['browserControl'],
  automation: ['(platform)'],
  system: ['(platform)'],
  agent: ['flowpilot'],
};

function inferModule(skill: AgentSkill): string {
  // Try to extract from handler `module:moduleName` pattern
  if (skill.handler?.startsWith('module:')) {
    return skill.handler.split(':')[1] ?? skill.category;
  }
  const mods = CATEGORY_TO_MODULES[skill.category];
  return mods?.[0] ?? skill.category;
}

export function McpSkillsPanel() {
  const { data: skills = [], isLoading } = useSkills();
  const toggleEnabled = useToggleSkill();
  const toggleMcp = useToggleMcpExposed();
  const bulkToggle = useBulkToggleSkills();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [exposureFilter, setExposureFilter] = useState<'all' | 'exposed' | 'hidden'>('all');

  const filtered = useMemo(() => {
    return skills.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (exposureFilter === 'exposed' && !s.mcp_exposed) return false;
      if (exposureFilter === 'hidden' && s.mcp_exposed) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !(s.description ?? '').toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [skills, categoryFilter, exposureFilter, search]);

  // Group by inferred module for the table
  const grouped = useMemo(() => {
    const map = new Map<string, AgentSkill[]>();
    for (const s of filtered) {
      const mod = inferModule(s);
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const exposedCount = skills.filter((s) => s.mcp_exposed).length;
  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">MCP Skills Catalog</CardTitle>
              <CardDescription className="mt-1">
                Skills exposed to external Model Context Protocol clients (OpenClaw, ClawWink,
                Claude Desktop, custom agents). FlowPilot consumes the same catalog — toggling
                MCP exposure here affects every external agent equally.
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Badge variant="secondary" className="text-xs">
                {exposedCount}/{skills.length} MCP-exposed
              </Badge>
              <Badge variant="outline" className="text-xs">
                {enabledCount} enabled
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="content">Content</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="communication">Communication</SelectItem>
                <SelectItem value="commerce">Commerce</SelectItem>
                <SelectItem value="automation">Automation</SelectItem>
                <SelectItem value="analytics">Analytics</SelectItem>
                <SelectItem value="search">Search</SelectItem>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="agent">Agent (FlowPilot)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={exposureFilter} onValueChange={(v: any) => setExposureFilter(v)}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exposure</SelectItem>
                <SelectItem value="exposed">MCP-exposed</SelectItem>
                <SelectItem value="hidden">Hidden from MCP</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button
              variant="outline" size="sm"
              onClick={() => bulkToggle.mutate({ ids: filtered.map((s) => s.id), enabled: true })}
              disabled={!filtered.length || bulkToggle.isPending}
            >
              Enable all
            </Button>
            <Button
              variant="outline" size="sm" asChild
            >
              <Link to="/admin/developer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                MCP Keys
              </Link>
            </Button>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="py-12 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading skills…
            </div>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No skills match the current filters.
            </p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[280px]">Skill</TableHead>
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead className="w-[100px]">Scope</TableHead>
                    <TableHead className="w-[100px]">Handler</TableHead>
                    <TableHead className="w-[120px] text-center">MCP exposed</TableHead>
                    <TableHead className="w-[100px] text-center">Enabled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map(([mod, list]) => (
                    <>
                      <TableRow key={`grp-${mod}`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={6} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {mod}
                          <span className="ml-2 font-normal normal-case text-[10px]">
                            ({list.length} skill{list.length === 1 ? '' : 's'})
                          </span>
                        </TableCell>
                      </TableRow>
                      {list.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{s.name}</div>
                            {s.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {s.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell><Badge variant="secondary" className="text-[10px]">{s.category}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{s.scope}</Badge></TableCell>
                          <TableCell><span className="text-xs text-muted-foreground">{s.handler.split(':')[0]}</span></TableCell>
                          <TableCell className="text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost" size="icon"
                                  className={`h-7 w-7 ${s.mcp_exposed ? 'text-primary' : 'text-muted-foreground/40'}`}
                                  onClick={() => toggleMcp.mutate({ id: s.id, mcp_exposed: !s.mcp_exposed })}
                                >
                                  {s.mcp_exposed ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {s.mcp_exposed ? 'Visible to external MCP clients' : 'Hidden from MCP'}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={s.enabled}
                              onCheckedChange={(v) => toggleEnabled.mutate({ id: s.id, enabled: v })}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
