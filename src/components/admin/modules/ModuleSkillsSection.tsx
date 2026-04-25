/**
 * ModuleSkillsSection
 *
 * Read-only operator view of skills owned by a module.
 * - Lists all skills declared by a module via getUnifiedSkillNames()
 * - Cross-references with live agent_skills table for status/description
 * - Provides "Try in FlowPilot" deeplink and "Open in Developer" for control
 *
 * Used in:
 *   - ModuleDetailSheet (right panel, contextual)
 *   - /admin/skills (global catalog, grouped per module)
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ChevronRight, ExternalLink, Cpu, Play, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSkills } from '@/hooks/useSkillHub';
import { getUnifiedSkillNames } from '@/lib/module-def';
import type { ModulesSettings } from '@/hooks/useModules';
import type { AgentSkill } from '@/types/agent';
import { cn } from '@/lib/utils';

interface ModuleSkillsSectionProps {
  moduleId: string;
  /** When true, render as a self-contained card with header. Default: collapsible inline. */
  variant?: 'inline' | 'card';
  /** Default open state for collapsible inline variant */
  defaultOpen?: boolean;
}

export function ModuleSkillsSection({
  moduleId,
  variant = 'inline',
  defaultOpen = false,
}: ModuleSkillsSectionProps) {
  const { data: allSkills = [], isLoading } = useSkills();

  const moduleSkills = useMemo(() => {
    const declaredNames = getUnifiedSkillNames(moduleId as keyof ModulesSettings);
    if (declaredNames.length === 0) return [];
    const set = new Set(declaredNames);
    return allSkills.filter(s => set.has(s.name));
  }, [allSkills, moduleId]);

  const enabledCount = moduleSkills.filter(s => s.enabled).length;
  const exposedCount = moduleSkills.filter(s => s.mcp_exposed).length;

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground py-3">Loading skills…</div>
    );
  }

  if (moduleSkills.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-3 italic">
        This module does not register any agent skills.
      </div>
    );
  }

  const list = (
    <div className="space-y-1.5">
      {moduleSkills.map(skill => (
        <SkillRow key={skill.id} skill={skill} />
      ))}
    </div>
  );

  const header = (
    <div className="flex items-center gap-2 w-full">
      <Sparkles className="h-4 w-4 text-primary shrink-0" />
      <span className="text-sm font-semibold">Agent Skills</span>
      <Badge variant="secondary" className="text-[10px] h-5">
        {enabledCount}/{moduleSkills.length}
      </Badge>
      {exposedCount > 0 && (
        <Badge variant="outline" className="text-[10px] h-5 gap-1">
          <Cpu className="h-2.5 w-2.5" />
          {exposedCount} via MCP
        </Badge>
      )}
    </div>
  );

  const footerLinks = (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t">
      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" asChild>
        <Link to="/admin/developer?tab=mcp-skills">
          <Cpu className="h-3 w-3" />
          Manage in Developer
          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
        </Link>
      </Button>
    </div>
  );

  if (variant === 'card') {
    return (
      <div className="rounded-lg border bg-card p-4">
        {header}
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          Actions FlowPilot and external agents can perform on behalf of this module.
        </p>
        {list}
        {footerLinks}
      </div>
    );
  }

  // inline collapsible
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity">
        {header}
        <ChevronRight className="h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        {list}
        {footerLinks}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Single skill row ─────────────────────────────────────────────────────────

function SkillRow({ skill }: { skill: AgentSkill }) {
  const tryPrompt = encodeURIComponent(`Use the ${skill.name} skill`);
  return (
    <div
      className={cn(
        'group flex items-start gap-2 px-2.5 py-2 rounded-md border bg-card hover:bg-accent/30 transition-colors',
        !skill.enabled && 'opacity-60'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs font-mono font-medium">{skill.name}</code>
          {!skill.enabled && (
            <Badge variant="outline" className="text-[9px] h-4 gap-0.5">
              <Lock className="h-2 w-2" /> Disabled
            </Badge>
          )}
          {skill.mcp_exposed && (
            <Badge variant="secondary" className="text-[9px] h-4 gap-0.5">
              <Cpu className="h-2 w-2" /> MCP
            </Badge>
          )}
          {skill.trust_level && skill.trust_level !== 'auto' && (
            <Badge variant="outline" className="text-[9px] h-4">
              {skill.trust_level}
            </Badge>
          )}
        </div>
        {skill.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
            {skill.description}
          </p>
        )}
      </div>
      {skill.enabled && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          asChild
          title="Try in FlowPilot"
        >
          <Link to={`/admin/flowpilot?prompt=${tryPrompt}`}>
            <Play className="h-3 w-3" />
          </Link>
        </Button>
      )}
    </div>
  );
}
