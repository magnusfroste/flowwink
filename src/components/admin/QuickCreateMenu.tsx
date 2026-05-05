import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, UserPlus, Briefcase, CheckSquare, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CreateLeadDialog } from '@/components/admin/CreateLeadDialog';
import { CreateTaskDialog } from '@/components/admin/CreateTaskDialog';
import { CreateTicketDialog } from '@/components/admin/tickets/CreateTicketDialog';
import { useIsModuleEnabled } from '@/hooks/useModules';

type DialogKey = 'lead' | 'deal' | 'task' | 'ticket' | null;

export function QuickCreateMenu() {
  const [active, setActive] = useState<DialogKey>(null);
  const leadsEnabled = useIsModuleEnabled('leads');
  const dealsEnabled = useIsModuleEnabled('deals');
  const ticketsEnabled = useIsModuleEnabled('tickets');

  // Keyboard shortcut: "c" opens menu via simulated click target
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        document.getElementById('quick-create-trigger')?.click();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button id="quick-create-trigger" size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Quick create (c)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Create new</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {leadsEnabled && (
            <DropdownMenuItem onSelect={() => setActive('lead')}>
              <UserPlus className="mr-2 h-4 w-4" /> Contact / lead
            </DropdownMenuItem>
          )}
          {dealsEnabled && (
            <DropdownMenuItem onSelect={() => setActive('deal')}>
              <Briefcase className="mr-2 h-4 w-4" /> Deal
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setActive('task')}>
            <CheckSquare className="mr-2 h-4 w-4" /> Activity / task
          </DropdownMenuItem>
          {ticketsEnabled && (
            <DropdownMenuItem onSelect={() => setActive('ticket')}>
              <LifeBuoy className="mr-2 h-4 w-4" /> Ticket
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {leadsEnabled && (
        <CreateLeadDialog open={active === 'lead'} onOpenChange={(o) => !o && setActive(null)} />
      )}
      {dealsEnabled && (
        <CreateDealDialog open={active === 'deal'} onOpenChange={(o) => !o && setActive(null)} />
      )}
      <CreateTaskDialog open={active === 'task'} onOpenChange={(o) => !o && setActive(null)} />
      {ticketsEnabled && (
        <CreateTicketDialog hideTrigger open={active === 'ticket'} onOpenChange={(o) => !o && setActive(null)} />
      )}
    </>
  );
}
