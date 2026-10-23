import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The chatter has the same three verbs as Odoo's.
 *
 * Log note (internal), Send message (to the customer, from the company
 * mailbox) and Schedule activity (what kind, when, who). The first two were
 * already the Discuss panel's Note and Email tabs. The third lived in two
 * places that did not meet: the Tasks card scheduled crm_tasks without a kind
 * or an assignee, the deal page had no Tasks card at all, and the Odoo
 * importer parked open activities in a table the kanban never reads. These
 * pin one next-step system: crm_tasks, with a type that gives the card its
 * icon, on the contact AND the deal, filled by the importer.
 */

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

describe('Schedule activity asks what kind, when and who', () => {
  it('crm_tasks has an activity_type with a closed set', () => {
    const mig = read('supabase/migrations/20261021213000_aktiviteten-har-en-typ-och-en-agare.sql');
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'todo'/);
    expect(mig).toMatch(/CHECK \(activity_type IN \('todo', 'call', 'email', 'meeting'\)\)/);
    expect(read('src/hooks/useCrmTasks.ts')).toMatch(/export const ACTIVITY_KINDS: ActivityKind\[\] = \['todo', 'call', 'email', 'meeting'\]/);
  });

  it('the Tasks card offers the kind and the assignee, defaulting to the scheduler', () => {
    const card = read('src/components/admin/crm/CrmTasksCard.tsx');
    expect(card).toMatch(/aria-label="Activity type"/);
    expect(card).toMatch(/aria-label="Assigned to"/);
    expect(card).toMatch(/assigned_to: assignee === 'me' \? user\?\.id \?\? null/);
    expect(read('src/hooks/useCrmTasks.ts')).toMatch(/assigned_to: assigned_to === undefined \? userData\.user\?\.id : assigned_to/);
  });

  it('the kanban chip shows the kind as an icon, from the same table of kinds', () => {
    const chip = read('src/components/admin/crm/NextStepChip.tsx');
    expect(chip).toMatch(/ACTIVITY_KIND_ICON/);
    expect(chip).toMatch(/<KindIcon className="h-3 w-3 shrink-0" \/>/);
    expect(read('src/hooks/useNextTasksIndex.ts')).toMatch(/select\('id, title, due_date, activity_type, lead_id, deal_id'\)/);
  });
});

describe('one next-step system, on the contact and on the deal', () => {
  it('the deal page carries the Tasks card the kanban chip reads', () => {
    expect(read('src/pages/admin/DealDetailPage.tsx')).toMatch(/<CrmTasksCard dealId=\{deal\.id\} \/>/);
    expect(read('src/pages/admin/LeadDetailPage.tsx')).toMatch(/<CrmTasksCard leadId=\{lead\.id\} \/>/);
  });

  it('the Odoo importer puts an open activity where the card reads it', () => {
    const src = read('supabase/functions/_shared/import/odoo.ts');
    const start = src.indexOf('async function phaseTodos(');
    const body = src.slice(start, src.indexOf('async function phaseAttachments(', start));
    expect(body).toMatch(/from\('crm_tasks'\)\.insert\(\{/);
    // The deal is read from the link cache; a model that is not preloaded reads as "no deal" (sandbox, 2026-10-21: 14 to-dos, 0 on a deal).
    expect(body).toMatch(/preload\(m\)[\s\S]{0,40}/);
    expect(body).toMatch(/\['res\.partner', 'res\.users', 'crm\.lead', 'crm\.lead#deal', 'mail\.activity'\]/);
    expect(body).toMatch(/deal_id: dealId && !dealId\.startsWith\('dry-'\) \? dealId : null/);
    expect(body).toMatch(/activity_type: activityType, priority: 'medium'/);
    // Companies have no card; they keep the generic activities row.
    expect(body).toMatch(/from\('activities'\)\.insert\(\{\s*entity_type: 'company'/);
    expect(body).toMatch(/target\.table === 'leads' \? 'crm_tasks' : 'activities'/);
  });
});

describe('Log note and Send message', () => {
  it('the Discuss panel keeps the internal note apart from the email that goes out', () => {
    const panel = read('src/components/admin/crm/RecordDiscussPanel.tsx');
    expect(panel).toMatch(/value: 'note'[^\n]*Internal note/);
    expect(panel).toMatch(/value: 'email'/);
    expect(panel).toMatch(/Sends from \{senderLabel\}/);
  });
});
