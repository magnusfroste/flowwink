import { useEffect, useMemo } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Wrench, Target, Activity, HelpCircle, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSkill } from '@/types/agent';

export interface CommandItem {
  name: string;
  description: string;
  category: string;
  icon?: React.ReactNode;
  isBuiltin?: boolean;
}

interface CommandPaletteProps {
  open: boolean;
  onSelect: (command: string) => void;
  onClose: () => void;
  skills: AgentSkill[];
  scope: 'admin' | 'visitor';
  filter: string;
  position?: { bottom: number; left: number };
}

const BUILTIN_COMMANDS: CommandItem[] = [
  { name: 'help', description: 'Show available commands', category: 'system', icon: <HelpCircle className="h-3.5 w-3.5" />, isBuiltin: true },
  { name: 'objectives', description: 'View active goals', category: 'system', icon: <Target className="h-3.5 w-3.5" />, isBuiltin: true },
  { name: 'activity', description: 'Recent agent activity', category: 'system', icon: <Activity className="h-3.5 w-3.5" />, isBuiltin: true },
  { name: 'migrate', description: 'Migrate a website', category: 'system', icon: <ArrowRightLeft className="h-3.5 w-3.5" />, isBuiltin: true },
];

const VISITOR_BUILTINS: CommandItem[] = [
  { name: 'help', description: 'Show available commands', category: 'system', icon: <HelpCircle className="h-3.5 w-3.5" />, isBuiltin: true },
];

const CATEGORY_LABELS: Record<string, string> = {
  system: 'System',
  content: 'Content',
  crm: 'CRM & Sales',
  communication: 'Communication',
  automation: 'Automation',
  search: 'Search',
  analytics: 'Analytics',
};

export function CommandPalette({ open, onSelect, onClose, skills, scope, filter }: CommandPaletteProps) {
  const commands = useMemo(() => {
    const builtins = scope === 'admin' ? BUILTIN_COMMANDS : VISITOR_BUILTINS;
    
    const skillCommands: CommandItem[] = skills.map(s => ({
      name: s.name,
      description: s.description || s.name.replace(/_/g, ' '),
      category: s.category,
      icon: <Wrench className="h-3.5 w-3.5" />,
    }));

    return [...builtins, ...skillCommands];
  }, [skills, scope]);

  const grouped = useMemo(() => {
    const filtered = filter
      ? commands.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
      : commands;

    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filtered) {
      const key = cmd.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(cmd);
    }
    return groups;
  }, [commands, filter]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const totalResults = Object.values(grouped).reduce((sum, g) => sum + g.length, 0);

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
      <div className="mx-4 rounded-xl border bg-popover text-popover-foreground shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="max-h-[280px] overflow-y-auto p-1">
          {totalResults === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">No matching commands</div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-1">
                <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {CATEGORY_LABELS[category] || category}
                </div>
                {items.map((cmd) => (
                  <button
                    key={cmd.name}
                    onClick={() => onSelect(cmd.name)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm',
                      'hover:bg-accent hover:text-accent-foreground transition-colors',
                      'focus:bg-accent focus:text-accent-foreground focus:outline-none'
                    )}
                  >
                    <span className="text-muted-foreground">{cmd.icon}</span>
                    <span className="font-medium">/{cmd.name.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground truncate flex-1 text-left">{cmd.description}</span>
                    {cmd.isBuiltin && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">built-in</Badge>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
