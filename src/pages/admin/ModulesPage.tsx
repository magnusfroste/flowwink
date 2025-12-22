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
  Check,
  Lock,
  UserCheck,
  Briefcase,
  Package,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useModules, useUpdateModules, defaultModulesSettings, type ModulesSettings } from "@/hooks/useModules";

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
  Package,
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content",
  data: "Data",
  communication: "Communication",
  system: "System",
};

const CATEGORY_ORDER = ["content", "communication", "data", "system"];

export default function ModulesPage() {
  const { data: modules, isLoading } = useModules();
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
    
    const updated = {
      ...localModules,
      [moduleId]: { ...module, enabled },
    };
    
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

  return (
    <AdminLayout>
      <div className="space-y-8">
        <AdminPageHeader
          title="Modules"
          description="Enable and disable features as needed. Disabled modules are hidden from the sidebar."
        />

        {/* Summary Card */}
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

        {/* Module Groups */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
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
                    const isEnabled = module.enabled;
                    const isCore = module.core;
                    
                    return (
                      <Card 
                        key={module.id}
                        className={`relative transition-all duration-200 ${
                          isEnabled 
                            ? "border-primary/30 bg-primary/5 shadow-sm" 
                            : "border-border/50 bg-muted/20"
                        }`}
                      >
                        {isCore && (
                          <Badge 
                            variant="secondary" 
                            className="absolute -top-2 right-3 text-xs"
                          >
                            <Lock className="h-3 w-3 mr-1" />
                            Core
                          </Badge>
                        )}
                        
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                                isEnabled 
                                  ? "bg-primary/10" 
                                  : "bg-muted"
                              }`}>
                                <IconComponent className={`h-5 w-5 transition-colors ${
                                  isEnabled 
                                    ? "text-primary" 
                                    : "text-muted-foreground"
                                }`} />
                              </div>
                              <div>
                                <CardTitle className="text-base">{module.name}</CardTitle>
                              </div>
                            </div>
                            
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={(checked) => handleToggle(module.id, checked)}
                              disabled={isCore || updateModules.isPending}
                              className="data-[state=checked]:bg-primary"
                            />
                          </div>
                        </CardHeader>
                        
                        <CardContent className="pt-0">
                          <CardDescription className="text-sm">
                            {module.description}
                          </CardDescription>
                          
                          {isEnabled && (
                            <div className="mt-3 flex items-center gap-1.5 text-xs text-primary">
                              <Check className="h-3.5 w-3.5" />
                              <span>Active</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
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
