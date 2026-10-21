import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Compass, X } from 'lucide-react';
import { useDismissedHints, useOdooImportPresence } from '@/hooks/useOdooLens';

/**
 * "Coming from Odoo?" — the glossary a team that migrated in reads once.
 *
 * Odoo's CRM is one wall: leads and opportunities are the same record, the
 * Pipeline is the opportunities in stages, and everything else hangs off the
 * form (chatter, activities, lost reason). FlowWink splits that wall in two
 * pages — Leads (the people and where they stand) and Deals (the money track
 * in stages) — and the first week is spent looking for things under the wrong
 * name. This card says where each Odoo word went, on the page where the
 * person is standing. It shows only after an Odoo import and until dismissed.
 */
interface Props {
  surface: 'leads' | 'deals';
}

const ROWS: Record<Props['surface'], Array<{ odoo: string; here: string }>> = {
  leads: [
    { odoo: 'Lead (not yet an opportunity)', here: 'A contact with status Lead — the Pipeline tab here' },
    { odoo: 'Convert to opportunity', here: 'Status Opportunity; a deal appears on the Deals page' },
    { odoo: 'Pipeline (opportunities in stages)', here: 'Deals — the kanban, with your Odoo stage names as columns' },
    { odoo: 'Contacts (res.partner)', here: 'All Contacts tab for people; Companies for organisations' },
    { odoo: 'Chatter: Log note / Send message', here: 'Discuss on the contact card — notes and emails in one timeline' },
    { odoo: 'Schedule activity (type, due, assigned to)', here: 'Tasks on the contact — same three fields; the next one is the dot on the card' },
    { odoo: 'Mark Lost + lost reason', here: 'Status Lost with a reason — the same discipline' },
    { odoo: 'Tags', here: 'On the contact and its card, as in Odoo; companies keep their own' },
    { odoo: 'Group by (owner, stage…)', here: 'Group by in All Contacts and in the Deals table' },
    { odoo: 'Favorites / saved filters', here: 'Saved views (the bookmark menu above)' },
  ],
  deals: [
    { odoo: 'Pipeline', here: 'This board — one card per opportunity, your Odoo stage names as columns' },
    { odoo: 'Stage', here: 'Deal stage — rename or reorder under Pipeline stages' },
    { odoo: 'Expected revenue', here: 'Deal value; the column header sums it' },
    { odoo: 'Probability', here: 'Set per stage, not per card' },
    { odoo: 'Expected closing', here: 'Expected close' },
    { odoo: 'Mark Won / Mark Lost', here: 'Drag to Won or Lost; Lost asks for the reason' },
    { odoo: 'Chatter and activities', here: 'Tasks on the deal (type, due, assigned to), Discuss on the contact behind it' },
    { odoo: 'The lead before it was an opportunity', here: 'The contact on the Leads page — a deal always points at one' },
    { odoo: 'Group by owner / stage / team', here: 'Group by in the table view (the list icon above)' },
  ],
};

export function OdooLensCard({ surface }: Props) {
  const presence = useOdooImportPresence();
  const hints = useDismissedHints();
  const hintId = `odoo-lens-${surface}`;
  if (!presence.data || hints.isDismissed(hintId)) return null;

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5" data-testid="odoo-lens">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
            <Compass className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="font-medium">Coming from Odoo?</p>
              <p className="text-sm text-muted-foreground">
                Your Odoo data is here, under FlowWink's names. Odoo keeps leads and opportunities on one
                wall; FlowWink shows the people on <Link to="/admin/contacts" className="underline">Leads</Link> and
                the money track on <Link to="/admin/deals" className="underline">Deals</Link>. The same record, two views.
              </p>
            </div>
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              {ROWS[surface].map((row) => (
                <div key={row.odoo} className="contents">
                  <dt className="text-muted-foreground">{row.odoo}</dt>
                  <dd className="text-foreground">{row.here}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs"
            onClick={() => hints.dismiss(hintId)}
            aria-label="Dismiss the Odoo guide"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Got it
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
