import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
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
          <Switch
            checked={skill.enabled}
            onCheckedChange={(v) => {
              // prevent card click
              onToggle(skill.id, v);
            }}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />
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
