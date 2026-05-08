import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Power, PowerOff } from "lucide-react";
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
  Rocket,
} from "lucide-react";

// Roadmap — small/easy modules planned next. Pure presentation; no toggles.
const PLANNED_MODULES: Array<{
  id: string;
  name: string;
  description: string;
  category: 'content' | 'data' | 'communication' | 'system' | 'insights';
  effort: 'S' | 'M' | 'L';
}> = [
  {
    id: 'vendor-portal',
    name: 'Vendor Portal',
    description: 'Self-service login for suppliers to view POs, upload invoices and track payments.',
    category: 'data',
    effort: 'M',
  },
  {
    id: 'carrier-labels',
    name: 'Carrier Labels (PostNord)',
    description: 'Generate shipping labels and tracking numbers via PostNord API from the Shipping module.',
    category: 'data',
    effort: 'S',
  },
  {
    id: 'performance-reviews',
    name: 'Performance Reviews',
    description: '1:1s, goals and appraisal cycles on top of the HR module.',
    category: 'data',
    effort: 'M',
  },
  {
    id: 'budgets',
    name: 'Budgets vs Actuals',
    description: 'Yearly/quarterly budget per account and analytic dimension, compared with bookings.',
    category: 'insights',
    effort: 'M',
  },
  {
    id: 'utm-attribution',
    name: 'UTM Attribution',
    description: 'Track UTM params through forms and orders to attribute revenue to campaigns.',
    category: 'insights',
    effort: 'S',
  },
  {
    id: 'csat-survey',
    name: 'CSAT Auto-Survey',
    description: 'Auto-trigger short survey when a ticket is resolved; feeds into Surveys module.',
    category: 'communication',
    effort: 'S',
  },
];
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useModules, useUpdateModules, defaultModulesSettings, type ModulesSettings } from "@/hooks/useModules";
import { useModuleStats } from "@/hooks/useModuleStats";
import { ModuleCard } from "@/components/admin/modules/ModuleCard";
import { moduleRegistry } from "@/lib/module-registry";
import { bootstrapModule, teardownModule } from "@/lib/module-bootstrap";
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

// Module dependencies - key depends on value
const MODULE_DEPENDENCIES: Partial<Record<keyof ModulesSettings, keyof ModulesSettings>> = {
  deals: 'leads',
  liveSupport: 'chat',
};

export default function ModulesPage() {
  const { data: modules, isLoading } = useModules();
  const { data: stats } = useModuleStats();
  const updateModules = useUpdateModules();
  const [localModules, setLocalModules] = useState<ModulesSettings | null>(null);
  const [search, setSearch] = useState("");

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
      bootstrapModule(moduleId, updated).catch(() => {});
      
      // When FlowPilot is turned ON, seed skills for all already-enabled modules
      if (moduleId === 'flowpilot') {
        Object.entries(updated).forEach(([id, config]) => {
          if (id !== 'flowpilot' && config.enabled) {
            bootstrapModule(id as keyof ModulesSettings, updated).catch(() => {});
          }
        });
      }
    } else {
      teardownModule(moduleId).catch(() => {});
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

  const enabledCount = localModules 
    ? Object.values(localModules).filter(m => m.enabled).length 
    : 0;
  const totalCount = Object.keys(defaultModulesSettings).length;
  const registeredModules = moduleRegistry.list();

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
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Roadmap — Planned modules (read-only) */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Roadmap — Coming soon
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Small, high-value modules planned next. Tackling the simplest first — vote or comment in GitHub Issues to influence priority.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PLANNED_MODULES.map((m) => (
              <Card key={m.id} className="border-dashed bg-muted/20">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm">{m.name}</h3>
                    <div className="flex gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-[10px]">Planned</Badge>
                      <Badge variant="secondary" className="text-[10px]">{m.effort}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {m.description}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {CATEGORY_LABELS[m.category]}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
