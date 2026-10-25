import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupRows, UNGROUPED_KEY } from '@/lib/group-by';

/**
 * The wall reads the same as in Odoo.
 *
 * A team from Odoo reads its pipeline at a distance: who the card is about,
 * who owns it, what it is tagged, and whether the next step is planned, due
 * or overdue — and groups the list by owner, stage or company before anything
 * else. These pin that both kanban cards carry owner, tags and next step,
 * that tags live on the contact (not only in an import note), and that the
 * two list surfaces group through one helper.
 */

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

describe('groupRows', () => {
  const rows = [
    { id: 1, owner: 'b', name: 'Bo' },
    { id: 2, owner: null, name: 'Nobody' },
    { id: 3, owner: 'a', name: 'Al' },
    { id: 4, owner: 'b', name: 'Bea' },
  ];
  const label = (k: string) => ({ a: 'Anna', b: 'Berit' })[k] ?? k;

  it('groups by key, labels, sorts by label and puts the empty group last', () => {
    const g = groupRows(rows, (r) => r.owner, label);
    expect(g.map((x) => x.label)).toEqual(['Anna', 'Berit', 'Unassigned']);
    expect(g[1].rows.map((r) => r.id)).toEqual([1, 4]);
    expect(g[2].key).toBe(UNGROUPED_KEY);
  });

  it('treats an empty string like no value, and keeps a custom empty label', () => {
    const g = groupRows([{ k: '' }, { k: 'x' }], (r) => r.k, (k) => k.toUpperCase(), 'No company');
    expect(g.map((x) => x.label)).toEqual(['X', 'No company']);
  });

  it('is one group when every row shares the key', () => {
    expect(groupRows(rows, () => 'all', () => 'All')).toHaveLength(1);
  });
});

describe('the cards carry what Odoo\'s do', () => {
  it('a lead card shows the owner, the tags and the next step', () => {
    const src = read('src/components/admin/leads/LeadKanban.tsx');
    expect(src).toMatch(/<OwnerChip entity="leads" recordId=\{lead\.id\} ownerId=\{lead\.assigned_to\} compact \/>/);
    expect(src).toMatch(/<TagChips tags=/);
    expect(src).toMatch(/<NextStepChip leadId=\{lead\.id\} \/>/);
  });

  it('a deal card shows the owner, the contact\'s tags and the next step', () => {
    const src = read('src/components/admin/DealKanbanCard.tsx');
    expect(src).toMatch(/<OwnerChip entity="deals"/);
    expect(src).toMatch(/<TagChips tags=\{deal\.lead\?\.tags\} \/>/);
    expect(src).toMatch(/<NextStepChip dealId=\{deal\.id\} \/>/);
    expect(read('src/hooks/useDeals.ts')).toMatch(/lead:leads\(id, name, email, company_id, tags, company:companies\(id, name\)\)/);
  });

  it('tags live on the contact: a migrated column the importer fills from crm.tag', () => {
    expect(read('supabase/migrations/20261021190000_taggar-pa-kontakten.sql')).toMatch(/ALTER TABLE public\.leads\s+ADD COLUMN IF NOT EXISTS tags text\[\] NOT NULL DEFAULT/);
    const types = read('src/integrations/supabase/types.ts');
    const block = types.slice(types.indexOf('      leads: {\n        Row: {'), types.indexOf('      leads: {\n        Row: {') + 3000);
    expect(block).toMatch(/tags: string\[\]/);
    const importer = read('supabase/functions/_shared/import/odoo.ts');
    expect(importer).toMatch(/const row: Rec = \{\s*tags: tagList,/);
  });
});

describe('Group by, on both list surfaces, through one helper', () => {
  it('the deals table groups by owner, stage, team or company and sums the group', () => {
    const src = read('src/pages/admin/DealsPage.tsx');
    expect(src).toMatch(/import \{ groupRows \} from '@\/lib\/group-by'/);
    expect(src).toMatch(/type DealGroupBy = 'none' \| 'owner' \| 'stage' \| 'team' \| 'company'/);
    expect(src).toMatch(/\{g\.label\} · \{g\.rows\.length\} · \{formatCurrency\(groupTotal\(g\.rows\), baseCurrency\)\}/);
    expect(src).toMatch(/currentConfig=\{\{ viewMode, groupBy \}\}/);
  });

  it('All Contacts groups by owner, status, company or source', () => {
    const src = read('src/pages/admin/LeadsPage.tsx');
    expect(src).toMatch(/import \{ groupRows \} from '@\/lib\/group-by'/);
    expect(src).toMatch(/type LeadGroupBy = 'none' \| 'owner' \| 'status' \| 'company' \| 'source'/);
    expect(src).toMatch(/currentConfig=\{\{ activeTab, searchQuery, statusFilter, groupBy \}\}/);
  });
});
