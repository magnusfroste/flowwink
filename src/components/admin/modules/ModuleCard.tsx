import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSeederForModule } from "@/lib/module-demo-seed";
import { 
  Check, 
  Lock, 
  Link2, 
  Info, 
  Hash,
  ArrowRight,
  ArrowRightLeft,
  Webhook,
  Monitor,
  Bot,
  Settings2,
  Eye,
  AlertTriangle,
  Plug,
  Sparkles,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { moduleRegistry } from "@/lib/module-registry";
import type { ModuleStats } from "@/hooks/useModuleStats";
import type { ModulesSettings, ModuleConfig, ModuleAutonomy } from "@/hooks/useModules";
import { useModuleReadiness } from "@/hooks/useModuleReadiness";
import { ModuleDetailSheet } from "./ModuleDetailSheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const AUTONOMY_CONFIG: Record<ModuleAutonomy, { 
  label: string; 
  icon: React.ComponentType<{ className?: string }>; 
  description: string;
  uiRequired: boolean;
}> = {
  'view-required': {
    label: 'View',
    icon: Eye,
    description: 'Data flows in passively — admin UI needed to review',
    uiRequired: true,
  },
  'config-required': {
    label: 'Config',
    icon: Settings2,
    description: 'Needs visual setup and configuration',
    uiRequired: true,
  },
  'agent-capable': {
    label: 'Agent',
    icon: Bot,
    description: 'Fully operable via FlowPilot — admin UI is optional',
    uiRequired: false,
  },
};

interface ModuleCardProps {
  moduleId: keyof ModulesSettings;
  config: ModuleConfig & { id: keyof ModulesSettings };
  isEnabled: boolean;
  isCore: boolean;
  dependsOn?: keyof ModulesSettings;
  dependsOnName?: string;
  stats?: ModuleStats;
  onToggle: (enabled: boolean) => void;
  onAdminUIToggle?: (enabled: boolean) => void;
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
  onAdminUIToggle,
  isUpdating,
  IconComponent,
}: ModuleCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const navigate = useNavigate();
  
  // Check if this module has a registry entry (has API)
  const registryModule = moduleRegistry.list().find(m => m.id === moduleId);
  const hasApi = !!registryModule;
  const capabilities = registryModule?.capabilities || [];
  
  // Integration readiness
  const readiness = useModuleReadiness(moduleId);
  const hasIntegrationDeps = readiness.totalRequired > 0 || readiness.totalOptional > 0 || readiness.missingAI || readiness.missingFlowPilot;
  
  // Simplified capability indicators
  const canReceiveContent = capabilities.includes('content:receive');
  const triggersWebhooks = capabilities.includes('webhook:trigger');

  const autonomy = config.autonomy || 'config-required';
  const autonomyInfo = AUTONOMY_CONFIG[autonomy];
  const AutonomyIcon = autonomyInfo.icon;
  const canToggleUI = autonomy === 'agent-capable';
  const adminUI = config.adminUI !== false; // default true

  // Demo seeder available?
  const seederName = getSeederForModule(moduleId);

  const handleSeed = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!seederName) return;
    setSeeding(true);
    try {
      const { data, error } = await supabase.rpc("seed_module_demo" as any, {
        p_module: seederName,
        p_scenario: "default",
      });
      if (error) throw error;
      const inserted =
        (data as { detail?: { inserted?: number } } | null)?.detail?.inserted ??
        0;
      toast.success(`Seeded ${inserted} demo ${seederName} row(s)`, {
        description: "Use Reset to remove only the demo data.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Seeding failed";
      toast.error(msg);
    } finally {
      setSeeding(false);
    }
  };

  const handleReset = async () => {
    if (!seederName) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_module_data", {
        p_module: seederName,
        p_dry_run: false,
        p_run_id: null,
      });
      if (error) throw error;
      const deleted =
        (data as { deleted_total?: number } | null)?.deleted_total ?? 0;
      toast.success(`Reset complete — removed ${deleted} demo row(s)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Reset failed";
      toast.error(msg);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Card
        className={`relative transition-all duration-200 cursor-pointer hover:shadow-sm ${
          isEnabled
            ? "border-primary/30 bg-primary/5 shadow-sm"
            : "border-border/50 bg-muted/20"
        }`}
        onClick={() => setDetailOpen(true)}
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
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 space-y-3">
          <CardDescription className="text-sm">
            {config.description}
          </CardDescription>
          
          {/* Stats, capabilities and autonomy row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Autonomy badge */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] px-1.5 py-0 gap-1 ${
                      autonomy === 'agent-capable' 
                        ? 'border-primary/40 text-primary' 
                        : ''
                    }`}
                  >
                    <AutonomyIcon className="h-2.5 w-2.5" />
                    {autonomyInfo.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  <p className="text-xs">{autonomyInfo.description}</p>
                </TooltipContent>
              </Tooltip>

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

          </div>

          {/* Admin UI toggle for agent-capable modules */}
          {isEnabled && canToggleUI && onAdminUIToggle && (
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Monitor className="h-3.5 w-3.5" />
                <span>Admin interface</span>
              </div>
              <Switch
                checked={adminUI}
                onCheckedChange={onAdminUIToggle}
                disabled={isUpdating}
                className="scale-75 data-[state=checked]:bg-primary"
              />
            </div>
          )}
          
          {/* Dependency warnings */}
          {isEnabled && readiness.missingFlowPilot && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Requires FlowPilot (disabled)</span>
              </div>
            </div>
          )}

          {isEnabled && !readiness.missingFlowPilot && readiness.flowPilotEnhancedButMissing && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Bot className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>Enhanced by FlowPilot (inactive)</span>
              </div>
            </div>
          )}
          
          {isEnabled && readiness.missingAI && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
              <button
                onClick={() => navigate('/admin/integrations')}
                className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:opacity-70 transition-opacity cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>No AI provider configured</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
              </button>
            </div>
          )}

          {/* Integration readiness indicator */}
          {isEnabled && hasIntegrationDeps && !readiness.missingFlowPilot && !readiness.missingAI && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
              {!readiness.ready ? (
                <button
                  onClick={() => navigate('/admin/integrations')}
                  className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:opacity-70 transition-opacity cursor-pointer"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Missing: {readiness.missingRequired.join(', ')}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Plug className="h-3.5 w-3.5" />
                  <span>
                    {readiness.activeRequired.length + readiness.activeOptional.length}/
                    {readiness.totalRequired + readiness.totalOptional} integrations
                  </span>
                </div>
              )}
            </div>
          )}

          {isEnabled && !hasApi && !stats && !canToggleUI && !hasIntegrationDeps && (
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Check className="h-3.5 w-3.5" />
              <span>Active</span>
            </div>
          )}

          {/* Demo data seeder — only for modules with a seeder registered */}
          {isEnabled && seederName && (
            <div className="pt-2 border-t border-border/50 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleSeed}
                disabled={seeding || resetting}
              >
                {seeding ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1.5" />
                )}
                Seed
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    disabled={seeding || resetting}
                  >
                    {resetting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes only rows seeded by previous demo runs for
                      <strong> {config.name}</strong>. Your real data,
                      manually-added rows and admin edits are never touched.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset}>
                      Remove demo rows
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
        moduleConfig={config}
        stats={stats}
        isEnabled={isEnabled}
        autonomy={autonomy}
        adminUI={adminUI}
      />
    </>
  );
}
