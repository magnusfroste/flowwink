import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertTriangle, Circle, ArrowRight } from "lucide-react";
import { useIntegrationStatus } from "@/hooks/useIntegrationStatus";
import { useCompanyInsights } from "@/hooks/useCompanyInsights";
import { useModuleAccess } from "@/hooks/useRoleModuleAccess";

interface Requirement {
  label: string;
  description: string;
  ok: boolean;
  required: boolean;
  href?: string;
  linkLabel?: string;
  /**
   * Module that owns the fix-page, per the access matrix. Omitted = the page
   * lives in the adminOnly System group (Integrations), so only an admin can
   * follow the link. The matrix decides, never a hardcoded role list.
   */
  moduleId?: string;
}

function StatusIcon({ ok, required }: { ok: boolean; required: boolean }) {
  if (ok) return <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />;
  if (required) return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
  return <Circle className="h-4 w-4 text-muted-foreground shrink-0" />;
}

/**
 * Sales Intelligence readiness — makes the module's dependencies visible.
 *
 * Required: an AI provider (fit scoring and outreach run through FlowPilot) and
 * an ICP defined in Business Identity (the thing we score prospects against).
 * Optional: enrichment integrations that deepen research quality.
 *
 * The DIAGNOSIS is shown to every role the matrix let onto the page; only the
 * FIX-link is withheld, and per requirement, from whoever cannot reach that
 * page. Hiding the whole card from non-admins — as this surface used to —
 * is the "denied permission rendered as absent data" class: sales was told
 * nothing at all rather than "your ICP is missing, ask an admin".
 */
/**
 * The three facts the Setup tab diagnoses, as one hook — so the Research tab
 * can say "your fit scores rest on an ICP that isn't there" BEFORE anyone
 * clicks Setup to find out. One reader of each fact; the card and the hint
 * can never disagree about what is rigged.
 */
export function useSalesIntelligenceReadiness() {
  const { data: status, isLoading: integrationsLoading } = useIntegrationStatus();
  const { profile, isLoading: profileLoading } = useCompanyInsights();
  const integrations = status?.integrations;
  const hasAi = !!(integrations?.openai || integrations?.gemini || integrations?.local_llm);
  const hasIcp = !!profile?.icp?.trim();
  const hasPositioning = !!(profile?.value_proposition?.trim() || (profile?.services?.length ?? 0) > 0);
  return {
    integrations,
    hasAi,
    hasIcp,
    hasPositioning,
    ready: hasAi && hasIcp && hasPositioning,
    isLoading: integrationsLoading || !!profileLoading,
  };
}

export function SalesIntelligenceReadiness() {
  const { integrations, hasAi, hasIcp, hasPositioning, isLoading } = useSalesIntelligenceReadiness();
  const { canAccess, isAdmin } = useModuleAccess();
  const canReach = (req: Requirement) =>
    isAdmin || (req.moduleId ? canAccess(req.moduleId) : false);

  const required: Requirement[] = [
    {
      label: "AI provider",
      description: "Fit scoring and introduction letters are reasoned by FlowPilot — OpenAI, Gemini or a local model must be connected.",
      ok: hasAi,
      required: true,
      href: "/admin/integrations",
      linkLabel: "Integrations",
    },
    {
      label: "Ideal Customer Profile (ICP)",
      description: "Defined once in Business Identity and used as the yardstick for every fit score.",
      ok: hasIcp,
      required: true,
      href: "/admin/company-insights",
      linkLabel: "Business Identity",
      moduleId: "companyInsights",
    },
    {
      label: "Positioning & services",
      description: "Value proposition and services let FlowPilot map prospect problems to what you actually sell.",
      ok: hasPositioning,
      required: true,
      href: "/admin/company-insights",
      linkLabel: "Business Identity",
      moduleId: "companyInsights",
    },
  ];

  const optional: Requirement[] = [
    {
      label: "Hunter.io",
      description: "Finds decision-maker email addresses on the prospect's domain.",
      ok: !!integrations?.hunter,
      required: false,
      href: "/admin/integrations",
      linkLabel: "Connect",
    },
    {
      label: "Firecrawl",
      description: "Scrapes the prospect's website for structured research input.",
      ok: !!integrations?.firecrawl,
      required: false,
      href: "/admin/integrations",
      linkLabel: "Connect",
    },
    {
      label: "Jina",
      description: "Fallback reader for pages Firecrawl can't reach.",
      ok: !!integrations?.jina,
      required: false,
      href: "/admin/integrations",
      linkLabel: "Connect",
    },
  ];

  const missingRequired = required.filter((r) => !r.ok).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Module readiness</CardTitle>
            <CardDescription>
              What Sales Intelligence needs to produce real insight instead of a data snapshot
            </CardDescription>
          </div>
          {!isLoading && (
            <Badge variant={missingRequired === 0 ? "default" : "destructive"}>
              {missingRequired === 0 ? "Ready" : `${missingRequired} missing`}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Required</p>
          {required.map((r) => (
            <RequirementRow key={r.label} req={r} reachable={canReach(r)} />
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Optional — deepens research
          </p>
          {optional.map((r) => (
            <RequirementRow key={r.label} req={r} reachable={canReach(r)} />
          ))}
        </div>

        <Separator />

        <p className="text-xs text-muted-foreground">
          The <strong>Sales Profile</strong> tab is sender context only — your name, title, tone and
          signature. ICP and positioning belong to the company and live in Business Identity.
        </p>
      </CardContent>
    </Card>
  );
}

function RequirementRow({ req, reachable }: { req: Requirement; reachable: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <StatusIcon ok={req.ok} required={req.required} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{req.label}</p>
          {!req.ok && !req.required && (
            <Badge variant="outline" className="text-[10px]">Not connected</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{req.description}</p>
      </div>
      {!req.ok && req.href && reachable && (
        <Button asChild variant="ghost" size="sm" className="gap-1 shrink-0">
          <Link to={req.href}>
            {req.linkLabel ?? "Open"}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      )}
      {!req.ok && req.href && !reachable && (
        <span className="shrink-0 text-xs text-muted-foreground">
          Ask an admin — {req.linkLabel ?? "settings"}
        </span>
      )}
    </div>
  );
}
