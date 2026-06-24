import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Power, PowerOff, RefreshCw } from "lucide-react";
import { 
  FileText, 
  BookOpen, 
  MessageSquare, 
  Mail, 
  Inbox, 
  Database, 
  LayoutGrid, 
  Image,
  Sparkles,
  Lock,
  UserCheck,
  Briefcase,
  Building2,
  Package,
  ShoppingCart,
  Library,
  Headphones,
  CalendarDays,
  BarChart3,
  Video,
  Target,
  FileUser,
  Network,
  Megaphone,
  Snowflake,
  FileSignature,
  FolderOpen,
  FolderKanban,
  Factory,
  
} from "lucide-react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useModules, useUpdateModules, defaultModulesSettings, type ModulesSettings } from "@/hooks/useModules";
import { useModuleStats } from "@/hooks/useModuleStats";
import { ModuleCard } from "@/components/admin/modules/ModuleCard";
import { EdgeFunctionUsageCard } from "@/components/admin/modules/EdgeFunctionUsageCard";
import { moduleRegistry } from "@/lib/module-registry";
import { bootstrapModule, teardownModule } from "@/lib/module-bootstrap";
import { bootstrapPlatform } from "@/lib/platform-seeds";
import { runWithConcurrency } from "@/lib/run-with-concurrency";
import { useToast } from "@/hooks/use-toast";
import '@/lib/module-bootstraps'; // Register all module bootstraps

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  BookOpen,
  MessageSquare,
  Mail,
  Inbox,
  Database,
  LayoutGrid,
  Image,
  UserCheck,
  Briefcase,
  Building2,
  Package,
  ShoppingCart,
  Library,
  Headphones,
  CalendarDays,
  BarChart3,
  Video,
  Target,
  FileUser,
  Network,
  Megaphone,
  Snowflake,
  FileSignature,
  FolderOpen,
  FolderKanban,
  Factory,
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content",
  data: "Data",
  communication: "Communication",
  system: "System",
  insights: "Insights",
};

const CATEGORY_ORDER = ["content", "communication", "data", "insights", "system"];

// Module dependencies - key depends on value.
// Most edges are derived from each module's `requires` field on its
// defineModule manifest (see src/lib/module-def.ts). The two entries below
// are kept for legacy modules that don't yet self-describe their dependencies.
const LEGACY_MODULE_DEPENDENCIES: Partial<Record<keyof ModulesSettings, keyof ModulesSettings>> = {
  deals: 'leads',
  liveSupport: 'chat',
};

function buildModuleDependencies(): Partial<Record<keyof ModulesSettings, keyof ModulesSettings>> {
  const map: Partial<Record<keyof ModulesSettings, keyof ModulesSettings>> = { ...LEGACY_MODULE_DEPENDENCIES };
  for (const mod of moduleRegistry.list()) {
    const def = moduleRegistry.get(mod.id) as { requires?: (keyof ModulesSettings)[] } | undefined;
    const requires = def?.requires;
    if (requires && requires.length > 0) {
      // Today the toggle UI tracks one parent per child — pick the first.
      // Multi-parent support arrives when we move to a real graph view.
      map[mod.id as keyof ModulesSettings] = requires[0];
    }
  }
  return map;
}

const MODULE_DEPENDENCIES = buildModuleDependencies();

export default function ModulesPage() {
  const { data: modules, isLoading } = useModules();
  const { data: stats } = useModuleStats();
  const updateModules = useUpdateModules();
  const { toast } = useToast();
  const [localModules, setLocalModules] = useState<ModulesSettings | null>(null);
  const [search, setSearch] = useState("");
  const [resyncing, setResyncing] = useState(false);
  const [searchParams] = useSearchParams();
  const deepLinkModule = searchParams.get("module");

  useEffect(() => {
    if (modules) {
      setLocalModules(modules);
    }
  }, [modules]);

  const handleToggle = async (moduleId: keyof ModulesSettings, enabled: boolean) => {
    if (!localModules) return;

    const module = localModules[moduleId];
    if (module.core) return; // Cannot toggle core modules

    let updated = {
      ...localModules,
      [moduleId]: { ...module, enabled },
    };

    // Handle cascading disables (when parent is disabled, disable dependents)
    if (!enabled) {
      for (const [depId, parentId] of Object.entries(MODULE_DEPENDENCIES)) {
        if (parentId === moduleId) {
          updated = {
            ...updated,
            [depId]: { ...updated[depId as keyof ModulesSettings], enabled: false },
          };
        }
      }
    }

    // Handle cascading enables (when dependent is enabled, enable parent)
    if (enabled) {
      const parentId = MODULE_DEPENDENCIES[moduleId];
      if (parentId && !localModules[parentId].enabled) {
        updated = {
          ...updated,
          [parentId]: { ...updated[parentId], enabled: true },
        };
      }
    }

    setLocalModules(updated);
    await updateModules.mutateAsync(updated);

    // Bootstrap or teardown module skills/data
    if (enabled) {
      try {
        const result = await bootstrapModule(moduleId, updated);
        if (result.errors.length > 0) {
          toast({
            title: `Bootstrap completed with ${result.errors.length} error(s)`,
            description: result.errors.slice(0, 3).join(' · '),
            variant: 'destructive',
          });
        }
      } catch (err) {
        toast({
          title: `Failed to bootstrap ${String(moduleId)}`,
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }

      // When FlowPilot is turned ON, reseed every already-enabled module so
      // their automations register. Run with concurrency limit (5) to avoid
      // hammering Supabase with 40+ simultaneous upserts and to surface
      // failures instead of silently swallowing them.
      if (moduleId === 'flowpilot') {
        const targets = Object.entries(updated)
          .filter(([id, config]) => id !== 'flowpilot' && config.enabled)
          .map(([id]) => id as keyof ModulesSettings);

        const results = await runWithConcurrency(targets, 5, (id) =>
          bootstrapModule(id, updated)
        );
        const failed = results.filter((r) => !r.ok || r.value.errors.length > 0);
        if (failed.length > 0) {
          const description = failed
            .slice(0, 3)
            .map((r) => {
              if (r.ok === false) {
                const msg = r.error instanceof Error ? r.error.message : 'failed';
                return `${String(r.item)}: ${msg}`;
              }
              return `${String(r.item)}: ${r.value.errors[0] ?? 'errors'}`;
            })
            .join(' · ');
          toast({
            title: `FlowPilot reseed: ${failed.length}/${targets.length} module(s) had issues`,
            description,
            variant: 'destructive',
          });
        }
      }
    } else {
      try {
        await teardownModule(moduleId);
      } catch (err) {
        toast({
          title: `Failed to teardown ${String(moduleId)}`,
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    }
  };

  const handleAdminUIToggle = async (moduleId: keyof ModulesSettings, adminUI: boolean) => {
    if (!localModules) return;
    
    const updated = {
      ...localModules,
      [moduleId]: { ...localModules[moduleId], adminUI },
    };
    
    setLocalModules(updated);
    await updateModules.mutateAsync(updated);
  };

  // Group modules by category (with search filter)
  const q = search.trim().toLowerCase();
  const groupedModules = localModules 
    ? CATEGORY_ORDER.map(category => ({
        category,
        label: CATEGORY_LABELS[category],
        modules: Object.entries(localModules)
          .filter(([id, config]) => config.category === category && id !== 'globalElements')
          .filter(([id, config]) => {
            if (!q) return true;
            return (
              config.name.toLowerCase().includes(q) ||
              (config.description ?? '').toLowerCase().includes(q) ||
              id.toLowerCase().includes(q)
            );
          })
          .map(([id, config]) => ({ id: id as keyof ModulesSettings, ...config }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })).filter(group => group.modules.length > 0)
    : [];

  const visibleToggleableIds = groupedModules.flatMap(g =>
    g.modules.filter(m => !m.core).map(m => m.id)
  );

  const handleBulkToggle = async (enabled: boolean) => {
    if (!localModules || visibleToggleableIds.length === 0) return;
    let updated = { ...localModules };
    for (const id of visibleToggleableIds) {
      updated = { ...updated, [id]: { ...updated[id], enabled } };
    }
    // Apply dependency cascade for disable
    if (!enabled) {
      for (const [depId, parentId] of Object.entries(MODULE_DEPENDENCIES)) {
        if (visibleToggleableIds.includes(parentId as keyof ModulesSettings)) {
          updated = { ...updated, [depId]: { ...updated[depId as keyof ModulesSettings], enabled: false } };
        }
      }
    }
    setLocalModules(updated);
    await updateModules.mutateAsync(updated);
    for (const id of visibleToggleableIds) {
      if (enabled) bootstrapModule(id, updated).catch(() => {});
      else teardownModule(id).catch(() => {});
    }
  };

  // Re-bootstrap every enabled module from the current code seeds. This is the
  // durable fix for skill drift: bootstrapModule() refreshes ALL definition
  // fields (description, tool_definition, handler, …) from src/lib/modules/*,
  // so improvements that shipped in code but never re-ran bootstrap on this
  // instance get synced. Run after a deploy on each instance.
  const handleResyncAll = async () => {
    if (!localModules) return;
    setResyncing(true);
    try {
      const targets = Object.entries(localModules)
        .filter(([, config]) => config.enabled)
        .map(([id]) => id as keyof ModulesSettings);
      const results = await runWithConcurrency(targets, 5, (id) => bootstrapModule(id, localModules));
      // Always re-seed platform-level skills & automations (Daily Briefing, etc).
      // These aren't owned by any module and must exist on every instance.
      await bootstrapPlatform().catch((err) => {
        console.warn('[ModulesPage] Platform seed refresh failed (non-fatal):', err);
      });
      const failed = results.filter((r) => !r.ok || r.value.errors.length > 0);
      if (failed.length > 0) {
        toast({
          title: `Synced ${targets.length - failed.length}/${targets.length} modules — ${failed.length} had issues`,
          description: failed.slice(0, 3).map((r) => r.ok === false
            ? `${String(r.item)}: ${r.error instanceof Error ? r.error.message : 'failed'}`
            : `${String(r.item)}: ${r.value.errors[0] ?? 'errors'}`).join(' · '),
          variant: 'destructive',
        });
      } else {
        toast({ title: `Synced skills from code for all ${targets.length} enabled modules` });
      }
    } finally {
      setResyncing(false);
    }
  };

  const enabledCount = localModules 
    ? Object.values(localModules).filter(m => m.enabled).length 
    : 0;
  const totalCount = Object.keys(defaultModulesSettings).length;
  const registeredModules = moduleRegistry.list();

  const enabledModuleIds = localModules
    ? (Object.entries(localModules)
        .filter(([, m]) => m.enabled)
        .map(([id]) => id) as (keyof ModulesSettings)[])
    : [];
  const moduleNames = localModules
    ? (Object.fromEntries(
        Object.entries(localModules).map(([id, m]) => [id, m.name]),
      ) as Partial<Record<keyof ModulesSettings, string>>)
    : {};

  return (
    <AdminLayout>
      <div className="space-y-8">
        <AdminPageHeader
          title="Modules"
          description="Enable and disable features as needed. Disabled modules are hidden from the sidebar."
        />

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{enabledCount} / {totalCount}</p>
                  <p className="text-sm text-muted-foreground">modules active</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-muted">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <Database className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{registeredModules.length}</p>
                  <p className="text-sm text-muted-foreground">with API contracts</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-muted">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <Lock className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {localModules ? Object.values(localModules).filter(m => m.core).length : 0}
                  </p>
                  <p className="text-sm text-muted-foreground">core modules</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Edge function footprint vs Supabase Free tier */}
        <EdgeFunctionUsageCard enabledModuleIds={enabledModuleIds} moduleNames={moduleNames} />

        {/* Registry Info */}
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <Badge variant="outline" className="mt-0.5">Module Registry</Badge>
            <div className="text-sm text-muted-foreground">
              <p>
                Modules with API contracts can receive content from Content Hub campaigns, 
                external webhooks, and the programmatic registry API. 
                See <code className="bg-muted px-1 py-0.5 rounded text-xs">docs/MODULE-API.md</code> for integration details.
              </p>
            </div>
          </div>
        </div>

        {/* Search + bulk actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search modules by name, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkToggle(true)}
            disabled={updateModules.isPending || visibleToggleableIds.length === 0}
          >
            <Power className="h-3.5 w-3.5 mr-1.5" />
            Enable {search ? 'matching' : 'all'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkToggle(false)}
            disabled={updateModules.isPending || visibleToggleableIds.length === 0}
          >
            <PowerOff className="h-3.5 w-3.5 mr-1.5" />
            Disable {search ? 'matching' : 'all'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResyncAll}
            disabled={resyncing || !localModules}
            title="Re-bootstrap every enabled module from code — syncs skill descriptions, tool definitions and handlers. Run after a deploy."
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${resyncing ? 'animate-spin' : ''}`} />
            {resyncing ? 'Syncing…' : 'Sync skills from code'}
          </Button>
        </div>

        {/* Module Groups */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {groupedModules.map(group => (
              <div key={group.category}>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                  {group.label}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.modules.map(module => {
                    const IconComponent = ICON_MAP[module.icon] || FileText;
                    const dependency = MODULE_DEPENDENCIES[module.id];
                    
                    return (
                      <ModuleCard
                        key={module.id}
                        moduleId={module.id}
                        config={module}
                        isEnabled={module.enabled}
                        isCore={!!module.core}
                        dependsOn={dependency}
                        dependsOnName={dependency ? localModules?.[dependency]?.name : undefined}
                        stats={stats?.[module.id]}
                        onToggle={(enabled) => handleToggle(module.id, enabled)}
                        onAdminUIToggle={module.autonomy === 'agent-capable' ? (adminUI) => handleAdminUIToggle(module.id, adminUI) : undefined}
                        isUpdating={updateModules.isPending}
                        IconComponent={IconComponent}
                        autoOpen={deepLinkModule === module.id}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
