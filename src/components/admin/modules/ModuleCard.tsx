import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Check, 
  Lock, 
  Link2, 
  Info, 
  Hash,
  ArrowRightLeft,
  Webhook,
} from "lucide-react";
import { moduleRegistry } from "@/lib/module-registry";
import type { ModuleStats } from "@/hooks/useModuleStats";
import type { ModulesSettings, ModuleConfig } from "@/hooks/useModules";
import { ModuleDetailSheet } from "./ModuleDetailSheet";

interface ModuleCardProps {
  moduleId: keyof ModulesSettings;
  config: ModuleConfig & { id: keyof ModulesSettings };
  isEnabled: boolean;
  isCore: boolean;
  dependsOn?: keyof ModulesSettings;
  dependsOnName?: string;
  stats?: ModuleStats;
  onToggle: (enabled: boolean) => void;
  isUpdating: boolean;
  IconComponent: React.ComponentType<{ className?: string }>;
}

export function ModuleCard({
  moduleId,
  config,
  isEnabled,
  isCore,
  dependsOn,
  dependsOnName,
  stats,
  onToggle,
  isUpdating,
  IconComponent,
}: ModuleCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  
  // Check if this module has a registry entry (has API)
  const registryModule = moduleRegistry.list().find(m => m.id === moduleId);
  const hasApi = !!registryModule;
  const capabilities = registryModule?.capabilities || [];
  
  // Simplified capability indicators
  const canReceiveContent = capabilities.includes('content:receive');
  const triggersWebhooks = capabilities.includes('webhook:trigger');

  return (
    <>
      <Card 
        className={`relative transition-all duration-200 ${
          isEnabled 
            ? "border-primary/30 bg-primary/5 shadow-sm" 
            : "border-border/50 bg-muted/20"
        }`}
      >
        {/* Top badges */}
        <div className="absolute -top-2 right-3 flex gap-1">
          {isCore && (
            <Badge variant="secondary" className="text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Core
            </Badge>
          )}
          {dependsOn && (
            <Badge variant="outline" className="text-xs bg-background">
              <Link2 className="h-3 w-3 mr-1" />
              {dependsOnName}
            </Badge>
          )}
        </div>
        
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                isEnabled ? "bg-primary/10" : "bg-muted"
              }`}>
                <IconComponent className={`h-5 w-5 transition-colors ${
                  isEnabled ? "text-primary" : "text-muted-foreground"
                }`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{config.name}</CardTitle>
                  {registryModule && (
                    <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                      v{registryModule.version}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <Switch
              checked={isEnabled}
              onCheckedChange={onToggle}
              disabled={isCore || isUpdating}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 space-y-3">
          <CardDescription className="text-sm">
            {config.description}
          </CardDescription>
          
          {/* Stats and capabilities row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Capability badges */}
              {canReceiveContent && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                  <ArrowRightLeft className="h-2.5 w-2.5" />
                  API
                </Badge>
              )}
              {triggersWebhooks && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                  <Webhook className="h-2.5 w-2.5" />
                  Webhooks
                </Badge>
              )}
              
              {/* Stats badge */}
              {stats && stats.count > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                  <Hash className="h-2.5 w-2.5" />
                  {stats.count}
                </Badge>
              )}
            </div>

            {/* Info button */}
            {(hasApi || stats) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setDetailOpen(true)}
              >
                <Info className="h-3.5 w-3.5 mr-1" />
                Details
              </Button>
            )}
          </div>
          
          {isEnabled && !hasApi && !stats && (
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Check className="h-3.5 w-3.5" />
              <span>Active</span>
            </div>
          )}
        </CardContent>
      </Card>

      <ModuleDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        moduleId={moduleId}
        moduleName={config.name}
        moduleDescription={config.description}
        stats={stats}
        isEnabled={isEnabled}
      />
    </>
  );
}
