import { useState, useEffect } from "react";
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
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useModules, useUpdateModules, defaultModulesSettings, type ModulesSettings } from "@/hooks/useModules";
import { useModuleStats } from "@/hooks/useModuleStats";
import { ModuleCard } from "@/components/admin/modules/ModuleCard";
import { moduleRegistry } from "@/lib/module-registry";

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
  orders: 'products',
};

export default function ModulesPage() {
  const { data: modules, isLoading } = useModules();
  const { data: stats } = useModuleStats();
  const updateModules = useUpdateModules();
  const [localModules, setLocalModules] = useState<ModulesSettings | null>(null);

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
    
    // If toggling Products, also toggle Orders
    if (moduleId === 'products') {
      updated = {
        ...updated,
        orders: { ...updated.orders, enabled },
      };
    }
    
    // If enabling Orders, also enable Products
    if (moduleId === 'orders' && enabled && !localModules.products.enabled) {
      updated = {
        ...updated,
        products: { ...updated.products, enabled: true },
      };
    }
    
    setLocalModules(updated);
    await updateModules.mutateAsync(updated);
  };

  // Group modules by category
  const groupedModules = localModules 
    ? CATEGORY_ORDER.map(category => ({
        category,
        label: CATEGORY_LABELS[category],
        modules: Object.entries(localModules)
          .filter(([_, config]) => config.category === category)
          .map(([id, config]) => ({ id: id as keyof ModulesSettings, ...config })),
      })).filter(group => group.modules.length > 0)
    : [];

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
      </div>
    </AdminLayout>
  );
}
