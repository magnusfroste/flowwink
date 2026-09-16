import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Clock, ExternalLink, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getBootstrapRegistry } from "@/lib/module-bootstrap";
import { moduleRegistry } from "@/lib/module-registry";
import type { ModulesSettings } from "@/hooks/useModules";

interface ModuleAutomationsSectionProps {
  moduleId: string;
}

/**
 * Collect seeded automations for a module from BOTH sources:
 *  - getBootstrapRegistry() (legacy registerBootstrap path)
 *  - moduleRegistry (unified defineModule path, exposes .automations)
 */
function collectSeededAutomationNames(moduleId: string): string[] {
  const names = new Set<string>();
  const fromBootstrap = getBootstrapRegistry()[moduleId as keyof ModulesSettings]?.automations ?? [];
  for (const a of fromBootstrap) names.add(a.name);
  const fromRegistry =
    (moduleRegistry.get(moduleId) as { automations?: Array<{ name: string }> } | undefined)
      ?.automations ?? [];
  for (const a of fromRegistry) names.add(a.name);
  return Array.from(names);
}

export function ModuleAutomationsSection({ moduleId }: ModuleAutomationsSectionProps) {
  const seededNames = collectSeededAutomationNames(moduleId);
  const queryClient = useQueryClient();

  const { data: automations, isLoading } = useQuery({
    queryKey: ["module-automations", moduleId, seededNames],
    enabled: seededNames.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_automations")
        .select(
          "id, name, description, trigger_type, trigger_config, executor, enabled, last_triggered_at, last_work_at, idle_run_count, next_run_at, run_count, last_error"
        )
        .in("name", seededNames)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("agent_automations")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { enabled }) => {
      toast.success(enabled ? "Automation enabled" : "Automation disabled");
      queryClient.invalidateQueries({ queryKey: ["module-automations", moduleId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (seededNames.length === 0) return null;

  const missing = seededNames.filter(
    (n) => !(automations ?? []).some((a) => a.name === n)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Automations</h4>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {seededNames.length}
          </Badge>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1">
          <Link to="/admin/automations">
            Manage <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3">
        Background jobs seeded by this module. They run via the platform automation dispatcher — no manual cron needed.
      </p>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-2">
          {(automations ?? []).map((a) => {
            const cron =
              a.trigger_type === "cron"
                ? (a.trigger_config as { expression?: string } | null)?.expression
                : null;
            return (
              <div
                key={a.id}
                className="rounded-lg border p-3 bg-muted/20 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <code className="text-xs font-mono truncate">{a.name}</code>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {a.executor}
                    </Badge>
                    {cron && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                        {cron}
                      </Badge>
                    )}
                    {a.trigger_type !== "cron" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {a.trigger_type}
                      </Badge>
                    )}
                  </div>
                  <Switch
                    checked={a.enabled}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: a.id, enabled: checked })
                    }
                    aria-label={`Toggle ${a.name}`}
                  />
                </div>
                {a.description && (
                  <p className="text-[11px] text-muted-foreground">{a.description}</p>
                )}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {a.last_triggered_at
                      ? `last ${formatDistanceToNow(new Date(a.last_triggered_at), { addSuffix: true })}`
                      : "never run"}
                  </span>
                  {a.next_run_at && (
                    <span>
                      next {formatDistanceToNow(new Date(a.next_run_at), { addSuffix: true })}
                    </span>
                  )}
                  <span>· {a.run_count} runs</span>
                </div>
                {/*
                  A tick that found nothing to do no longer writes an activity
                  row — ~14 800 of old liteit's 18 138 were exactly that. So the
                  automation row has to say both things out loud: when it last
                  ran, and when it last actually changed something.
                */}
                {(a.last_work_at || (a.idle_run_count ?? 0) > 0) && (
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {a.last_work_at
                        ? `did work ${formatDistanceToNow(new Date(a.last_work_at), { addSuffix: true })}`
                        : "no work done yet"}
                    </span>
                    {(a.idle_run_count ?? 0) > 0 && (
                      <span>· {a.idle_run_count} idle runs since (not logged)</span>
                    )}
                  </div>
                )}
                {a.last_error && (
                  <p className="text-[11px] text-destructive flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    {a.last_error}
                  </p>
                )}
              </div>
            );
          })}

          {missing.length > 0 && (
            <div className="rounded-lg border border-dashed p-3 text-[11px] text-muted-foreground">
              <p className="flex items-center gap-1 mb-1">
                <AlertCircle className="h-3 w-3" />
                {missing.length} automation(s) not yet seeded on this instance:
              </p>
              <ul className="font-mono pl-4">
                {missing.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
              <p className="mt-1">Toggle the module off and on again to re-seed.</p>
            </div>
          )}

          {(automations ?? []).length > 0 && missing.length === 0 && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              All automations registered.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
