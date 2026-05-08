import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ALL_WORKSPACE_SOURCES, type WorkspaceSource } from '@/hooks/useWorkspaceChat';
import { FileText, FileSignature, BookOpen, Layout, Users, UserCheck, RotateCcw } from 'lucide-react';

const SOURCE_META: Record<WorkspaceSource, { label: string; description: string; Icon: any }> = {
  documents: { label: 'Documents', description: 'Files & uploaded docs', Icon: FileText },
  contracts: { label: 'Contracts', description: 'Legal & employment contracts', Icon: FileSignature },
  kb: { label: 'Knowledge Base', description: 'Articles & how-tos', Icon: BookOpen },
  pages: { label: 'Pages', description: 'Published website pages', Icon: Layout },
  crm: { label: 'CRM', description: 'Leads & deals', Icon: Users },
  employees: { label: 'Employees', description: 'HR records', Icon: UserCheck },
  wiki: { label: 'Wiki', description: 'Internal intranet pages', Icon: BookOpen },
};

interface Props {
  selected: WorkspaceSource[];
  onChange: (next: WorkspaceSource[]) => void;
  onReset: () => void;
}

export function SourceFilterPanel({ selected, onChange, onReset }: Props) {
  const toggle = (key: WorkspaceSource) => {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Sources</CardTitle>
          <Button variant="ghost" size="sm" onClick={onReset} className="h-7 text-xs gap-1">
            <RotateCcw className="h-3 w-3" /> All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ALL_WORKSPACE_SOURCES.map((key) => {
          const meta = SOURCE_META[key];
          const Icon = meta.Icon;
          const checked = selected.includes(key);
          return (
            <div key={key} className="flex items-start gap-3">
              <Checkbox
                id={`src-${key}`}
                checked={checked}
                onCheckedChange={() => toggle(key)}
                className="mt-0.5"
              />
              <Label
                htmlFor={`src-${key}`}
                className="flex-1 cursor-pointer space-y-0.5"
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {meta.label}
                </div>
                <div className="text-xs text-muted-foreground font-normal">
                  {meta.description}
                </div>
              </Label>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
