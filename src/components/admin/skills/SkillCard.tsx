import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import type { AgentSkill, AgentScope, AgentSkillCategory } from '@/types/agent';

const SCOPE_COLORS: Record<AgentScope, string> = {
  internal: 'bg-blue-500/10 text-blue-600 border-blue-200',
  external: 'bg-green-500/10 text-green-600 border-green-200',
  both: 'bg-purple-500/10 text-purple-600 border-purple-200',
};

const CATEGORY_LABELS: Record<AgentSkillCategory, string> = {
  content: 'Content',
  crm: 'CRM',
  communication: 'Communication',
  automation: 'Automation',
  search: 'Search',
  analytics: 'Analytics',
  growth: 'Growth',
};

function handlerLabel(handler: string) {
  const [type] = handler.split(':');
  return type.charAt(0).toUpperCase() + type.slice(1);
}

interface SkillCardProps {
  skill: AgentSkill;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (skill: AgentSkill) => void;
}

export function SkillCard({ skill, onToggle, onEdit }: SkillCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow group"
      onClick={() => onEdit(skill)}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-sm truncate">{skill.name}</h3>
            {skill.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {skill.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onEdit(skill); }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            <Switch
              checked={skill.enabled}
              onCheckedChange={(v) => onToggle(skill.id, v)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className={SCOPE_COLORS[skill.scope]}>
            {skill.scope}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {CATEGORY_LABELS[skill.category]}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {handlerLabel(skill.handler)}
          </Badge>
          {skill.requires_approval && (
            <Badge variant="destructive" className="text-[10px]">
              Approval
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
