import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlToText, mapDealStage, mapLostReason, ODOO_PHASES, planStageRelabels, SEED_DEAL_STAGE_NAMES } from '../../../supabase/functions/_shared/import/odoo';

/**
 * import_from_odoo — a migration that can be run twice.
 *
 *   1. Dry run is the default and credentials are secrets, never arguments
 *      (an argument is logged in agent_activity).
 *   2. Every row remembers its Odoo id in import_links, so a re-run updates.
 *   3. It writes the tables the UI reads (companies, leads, deals), not the
 *      partners backbone directly — backfill_partners derives that.
 *   4. The stage and lost-reason rules are pure and tested here.
 *   5. It is a handler in agent-execute, not a new edge function (budget).
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const mod = read('supabase/functions/_shared/import/odoo.ts');

describe('the rules', () => {
  it('maps Odoo stages onto FlowWink deal stages by flag, name, then position', () => {
    const total = 4;
    expect(mapDealStage({ name: 'New', is_won: false, index: 0, total }, false)).toBe('lead');
    expect(mapDealStage({ name: 'Qualified', is_won: false, index: 1, total }, false)).toBe('qualified');
    expect(mapDealStage({ name: 'Proposition', is_won: false, index: 2, total }, false)).toBe('proposal');
    expect(mapDealStage({ name: 'Won', is_won: true, index: 3, total }, false)).toBe('closed_won');
    expect(mapDealStage({ name: 'Won', is_won: true, index: 3, total }, true)).toBe('closed_lost');
    expect(mapDealStage({ name: 'Steg 3', is_won: false, index: 3, total: 6 }, false)).toBe('qualified');
  });

  it('maps lost reasons onto the enum and keeps the words elsewhere', () => {
    expect(mapLostReason('Too expensive')).toBe('price');
    expect(mapLostReason("We don't have people/skills")).toBe('other');
    expect(mapLostReason('Chose a competitor')).toBe('competitor');
    expect(mapLostReason(null)).toBe('other');
  });

  it('turns chatter HTML into readable text', () => {
    expect(htmlToText('<p>Hello <b>Jan</b>,</p><p>Offert bifogad &amp; klar.<br/>Mvh</p>')).toBe('Hello Jan,\nOffert bifogad & klar.\nMvh');
    expect(htmlToText(false)).toBe('');
  });

  it('runs the phases in dependency order', () => {
    expect([...ODOO_PHASES]).toEqual(['users', 'companies', 'contacts', 'leads', 'messages', 'todos', 'attachments']);
  });
});

describe('the shape', () => {
  it('dry run by default, credentials from secrets only, re-runs through import_links', () => {
    expect(mod).toMatch(/dry_run: rawArgs\.dry_run !== false/);
    expect(mod).toMatch(/Deno\.env\.get\('ODOO_API_KEY'\)/);
    expect(mod).not.toMatch(/rawArgs\.(api_key|password|apiKey)/);
    expect(mod).toMatch(/from\('import_links'\)\.upsert\(/);
    expect(mod).toMatch(/onConflict: 'source,model,external_id'/);
    expect(read('supabase/migrations/20261020220000_import-links-odoo-id-till-flowwink-id.sql')).toMatch(/PRIMARY KEY \(source, model, external_id\)/);
  });

  it('writes the UI tables and lets backfill_partners derive the backbone; notifications are skipped', () => {
    expect(mod).toMatch(/from\('companies'\)\.insert\(/);
    expect(mod).toMatch(/from\('leads'\)\.insert\(/);
    expect(mod).toMatch(/from\('deals'\)\.insert\(/);
    expect(mod).not.toMatch(/from\('partners'\)\.(insert|upsert)/);
    expect(mod).toMatch(/rpc\('backfill_partners', \{ p_dry_run: false \}\)/);
    expect(mod).toMatch(/\['message_type', 'in', \['comment', 'email'\]\]/);
    // a re-run never demotes a lead FlowWink moved forward
    expect(mod).toMatch(/STATUS_RANK\[patch\.status\] \?\? 0\) <= \(STATUS_RANK\[currentStatus\] \?\? 0\)/);
    // links are written in batches, and flushed after every phase
    expect(mod).toMatch(/if \(this\.pending\.length >= 100\) await this\.flush\(\);/);
    expect(mod).toMatch(/await links\.flush\(\);\s*reports\.push\(r\);/);
  });

  it('is a handler in agent-execute and a CRM skill, not a new deployable', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    expect(ae).toMatch(/handler === 'internal:import_from_odoo'/);
    expect(ae).toMatch(/uploadDocument: \(a\) => executeUploadDocument\(supabase, a, \{ caller_user_id, caller_api_key_id \}\)/);
    const crm = read('src/lib/modules/crm-module.ts');
    expect(crm).toMatch(/name: 'import_from_odoo'/);
    expect(crm).toMatch(/handler: 'internal:import_from_odoo'/);
    expect(crm).toMatch(/dry_run: \{ type: 'boolean', default: true/);
    expect(read('supabase/functions/check-secrets/index.ts')).toMatch(/odoo: !!\(Deno\.env\.get\('ODOO_URL'\)/);
    expect(read('.env.example')).toMatch(/ODOO_API_KEY/);
  });
});

/**
 * Recognition is the columns. A team from Odoo has looked at "Nytt →
 * Kvalificerad → Offert → Vunnen" for years; the board should read the same.
 */
describe('the columns keep their Odoo names', () => {
  const fw = (Object.entries(SEED_DEAL_STAGE_NAMES) as Array<[string, string]>).map(([key, name], i) => ({ id: `s${i}`, entity_type: 'deal', key, name }));
  const odoo = (names: string[], won = 'Vunnen') =>
    [...names, won].map((name, index, all) => ({ name, is_won: name === won, index, total: all.length }));

  it('relabels a seed-named stage when exactly one Odoo stage maps onto it', () => {
    const plan = planStageRelabels(odoo(['Nytt', 'Kvalificerad', 'Offert skickad', 'Förhandling']), fw);
    const to = Object.fromEntries(plan.relabels.map((r) => [r.key, r.to]));
    expect(to).toEqual({ lead: 'Nytt', qualified: 'Kvalificerad', proposal: 'Offert skickad', negotiation: 'Förhandling', closed_won: 'Vunnen' });
    expect(plan.shared).toEqual([]);
    expect(plan.kept).toEqual([]);
  });

  it('keeps the FlowWink name when two Odoo stages share a key, and says so', () => {
    const plan = planStageRelabels(odoo(['Nytt', 'Kvalificerad', 'Offert', 'Offert godkänd']), fw);
    expect(plan.relabels.find((r) => r.key === 'proposal')).toBeUndefined();
    expect(plan.shared).toEqual([{ key: 'proposal', odoo: ['Offert', 'Offert godkänd'] }]);
  });

  it('never overwrites a stage the operator renamed', () => {
    const renamed = fw.map((f) => (f.key === 'qualified' ? { ...f, name: 'Pratat med' } : f));
    const plan = planStageRelabels(odoo(['Nytt', 'Kvalificerad']), renamed);
    expect(plan.relabels.find((r) => r.key === 'qualified')).toBeUndefined();
    expect(plan.kept).toEqual([{ key: 'qualified', name: 'Pratat med', odoo: 'Kvalificerad' }]);
  });

  it('is a no-op when the names already match', () => {
    expect(planStageRelabels(odoo(['Lead', 'Qualified'], 'Closed Won'), fw).relabels).toEqual([]);
  });

  it('runs once per import, only on a real run, and can be switched off', () => {
    expect(mod).toMatch(/p\.cursor === 0 && p\.args\.relabel_stages !== false/);
    expect(mod).toMatch(/if \(!p\.args\.dry_run\) \{\s*const \{ error \} = await p\.ctx\.supabase\.from\('pipeline_stages'\)\.update\(\{ name: rl\.to \}\)/);
    expect(read('src/lib/modules/crm-module.ts')).toMatch(/relabel_stages: \{ type: 'boolean', default: true/);
  });
});

describe('the Odoo lens', () => {
  it('is one card, mounted on both the Leads and the Deals page', () => {
    const card = read('src/components/admin/crm/OdooLensCard.tsx');
    expect(card).toMatch(/useOdooImportPresence\(\)/);
    expect(card).toMatch(/hints\.isDismissed\(hintId\)/);
    expect(read('src/pages/admin/LeadsPage.tsx')).toMatch(/<OdooLensCard surface="leads" \/>/);
    expect(read('src/pages/admin/DealsPage.tsx')).toMatch(/<OdooLensCard surface="deals" \/>/);
  });

  it('appears only after an Odoo import and follows the user, not the browser', () => {
    const hook = read('src/hooks/useOdooLens.ts');
    expect(hook).toMatch(/from\('import_links' as never\)[\s\S]{0,120}\.eq\('source', 'odoo'\)/);
    expect(hook).toMatch(/preferences/);
    expect(hook).not.toMatch(/localStorage/);
  });
});
