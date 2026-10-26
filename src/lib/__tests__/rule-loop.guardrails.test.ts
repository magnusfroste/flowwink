import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountingModule } from '@/lib/modules/accounting-module';
import { reconciliationModule } from '@/lib/modules/reconciliation-module';

/**
 * The rule loop (20261026140000): a bookkeeping rule is a template, offered
 * after a decision ("book <counterparty> like this next time? yes / not now")
 * and listed where the decisions are made. Nothing is learned without an
 * answer — except for a caller that never adopted the prompt, where the old
 * silent vendor ramp still runs.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261026140000_regeln-foreslas-och-syns.sql');
const agentExecute = read('supabase/functions/agent-execute/index.ts');
const seedsOf = (m: { agent?: { skillSeeds?: unknown[] }; skillSeeds?: unknown[] }) =>
  (m.agent?.skillSeeds ?? m.skillSeeds ?? []) as Array<{ name: string; description: string; instructions?: string; tool_definition: { function: { parameters: { properties: Record<string, { enum?: string[] }> } } } }>;

describe('a rule is a template, and one decision is one rule', () => {
  it('reconciliation_rules carries the template, the source and the count', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS suggested_template_id uuid REFERENCES public\.accounting_templates\(id\) ON DELETE SET NULL/);
    expect(migration).toMatch(/source IN \('manual', 'learned', 'agent'\)/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS times_applied integer NOT NULL DEFAULT 0/);
  });

  it('the old RPC overload is dropped before the new one exists — two signatures would make every call ambiguous', () => {
    const drop = migration.indexOf('DROP FUNCTION IF EXISTS public.manage_reconciliation_rule(text, uuid, text, text, text, text, text, text, integer);');
    const create = migration.indexOf('CREATE OR REPLACE FUNCTION public.manage_reconciliation_rule(');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.manage_reconciliation_rule\(text, uuid, text, text, text, text, text, text, integer, uuid, text\) TO authenticated, service_role/);
  });

  it('the same decision twice updates the rule; an empty rule is refused; the list names the template', () => {
    expect(migration).toMatch(/WHERE match_field = p_match_field AND match_type = p_match_type AND lower\(pattern\) = lower\(p_pattern\)/);
    expect(migration).toContain("'updated_existing', true");
    expect(migration).toContain('A rule needs something to do');
    expect(migration).toContain("'suggested_template_name', t.template_name");
    expect(migration).toContain("RAISE EXCEPTION '__rule_proof_ok__'");
  });

  it('accounting staff may write rules too — the loop lives on the accounting page', () => {
    expect(migration).toMatch(/can_access_module\(auth\.uid\(\), 'reconciliation'\) OR can_access_module\(auth\.uid\(\), 'accounting'\)/);
    expect(migration).toMatch(/FUNCTION public\.note_reconciliation_rule_applied\(p_rule_id uuid\)/);
  });
});

describe('the proposal follows the rule first', () => {
  it('routing rule #0: a rule with a template outranks the vendor default and the keyword scorer', () => {
    const rule0 = agentExecute.indexOf('// Routing rule #0: a rule with a template (if direction-compatible).');
    const rule1 = agentExecute.indexOf('// Routing rule #1: vendor default wins (if direction-compatible).');
    expect(rule0).toBeGreaterThan(-1);
    expect(rule1).toBeGreaterThan(rule0);
    expect(agentExecute).toContain("from('reconciliation_rules')");
    expect(agentExecute).toContain(".not('suggested_template_id', 'is', null)");
    expect(agentExecute).toContain('const ruleConfidence = Math.min(98, 90 + 4 * confirmedR);');
    expect(agentExecute).toContain('match_details: [`rule:${rule.name}`');
    expect(agentExecute).toMatch(/rule_id: rule\.id,\s*rule_name: rule\.name,/);
  });

  it('rule matching speaks the same contains/equals/regex as apply_reconciliation_rules, and a bad regex never throws', () => {
    expect(agentExecute).toMatch(/if \(rule\.match_type === 'equals'\) return value\.trim\(\)\.toLowerCase\(\) === pat\.trim\(\)\.toLowerCase\(\);/);
    expect(agentExecute).toMatch(/if \(rule\.match_type === 'regex'\) \{ try \{ return new RegExp\(pat, 'i'\)\.test\(value\); \} catch \{ return false; \} \}/);
  });

  it('the sweep credits the rule and never learns one by itself', () => {
    expect(agentExecute).toMatch(/match_source: p\.rule_id \? 'rule'/);
    expect(agentExecute).toMatch(/\.\.\.\(p\.rule_id \? \{ rule_id: p\.rule_id \} : \{\}\),/);
    const sweep = agentExecute.slice(agentExecute.indexOf("const proposals = await executeDbAction(supabase, 'propose_bookkeeping'"), agentExecute.indexOf('summary.auto_booked = booked;'));
    expect(sweep).not.toContain('remember_counterparty: true');
  });
});

describe('nothing is learned without an answer', () => {
  it('remember_counterparty true makes a rule, false learns nothing, absent keeps the legacy vendor ramp', () => {
    expect(agentExecute).toMatch(/if \(bankTxCounterparty && explicitTemplateId && rememberCounterparty === true\) \{/);
    expect(agentExecute).toMatch(/p_action: 'create',\s*p_name: ruleName,\s*p_match_field: 'counterparty',\s*p_match_type: 'equals',\s*p_pattern: bankTxCounterparty,\s*p_suggested_template_id: explicitTemplateId,/);
    expect(agentExecute).toMatch(/\} else if \(bankTxCounterparty && explicitTemplateId && rememberCounterparty === undefined\) \{/);
    // The legacy ramp text the dual-axis guard pins still lives in the undefined branch.
    expect(agentExecute).toContain('Auto-learned from agentic bookkeeping');
  });

  it('a booking that followed a rule is counted on it; one nothing decided for carries rule_suggestion', () => {
    expect(agentExecute).toContain("await supabase.rpc('note_reconciliation_rule_applied', { p_rule_id: followedRuleId })");
    expect(agentExecute).toMatch(/rememberCounterparty !== true && !followedRuleId\s*&& matchSourceArg !== 'rule' && matchSourceArg !== 'vendor-default'/);
    expect(agentExecute).toMatch(/\.\.\.\(ruleSuggestion \? \{ rule_suggestion: ruleSuggestion \} : \{\}\),/);
    expect(agentExecute).toMatch(/\.\.\.\(ruleCreated \? \{ rule_created: ruleCreated \} : \{\}\),/);
  });

  it('the skills say so', () => {
    const je = seedsOf(accountingModule).find((s) => s.name === 'manage_journal_entry')!;
    const props = je.tool_definition.function.parameters.properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['remember_counterparty', 'rule_id', 'match_source']));
    expect(props.match_source.enum).toEqual(['rule', 'vendor-default', 'keyword', 'manual']);
    expect(je.instructions).toContain('THE RULE LOOP');
    expect(je.instructions).toContain('a one-off booking must not become a rule');
    const rule = seedsOf(reconciliationModule).find((s) => s.name === 'manage_reconciliation_rule')!;
    expect(Object.keys(rule.tool_definition.function.parameters.properties)).toEqual(expect.arrayContaining(['p_suggested_template_id', 'p_source']));
    expect(rule.description).toContain('routing rule #0');
    const propose = seedsOf(reconciliationModule).find((s) => s.name === 'propose_bookkeeping')!;
    expect(propose.instructions).toContain('rule_id');
    expect(propose.instructions).toContain('rule_suggestion');
  });
});

describe('the loop a person sees', () => {
  const tab = read('src/components/admin/accounting/EventsToBookTab.tsx');

  it('Events to book books with remember_counterparty false and asks the question once', () => {
    expect(tab).toContain('remember_counterparty: false');
    expect(tab).toMatch(/const matchSource = p\.rule_id && !overridden\s*\? 'rule'/);
    expect(tab).toMatch(/\.\.\.\(p\.rule_id && !overridden \? \{ rule_id: p\.rule_id \} : \{\}\),/);
    expect(tab).toContain('res?.rule_suggestion');
    expect(tab).toContain('!batchMode && !isDismissed(suggestion.counterparty)');
    expect(tab).toContain('Yes, make it a rule');
    expect(tab).toContain('Not now');
    expect(tab).toMatch(/p_source: 'learned',/);
  });

  it('"not now" is remembered for a month, per viewer, and survives a blocked localStorage', () => {
    expect(tab).toContain("const RULE_PROMPT_DISMISSALS = 'accounting.rulePrompts.dismissed';");
    expect(tab).toContain('const DISMISS_DAYS = 30;');
    expect(tab).toMatch(/try \{ return JSON\.parse\(localStorage\.getItem\(RULE_PROMPT_DISMISSALS\) \?\? '\{\}'\)/);
  });

  it('the rules are one click away, with the template, the source and the count', () => {
    expect(tab).toContain("Rules ({rules.length})");
    expect(tab).toContain("{view === 'rules' ? (");
    expect(tab).toContain('<ReconciliationRulesPanel />');
    const panel = read('src/components/admin/reconciliation/ReconciliationRulesPanel.tsx');
    expect(panel).toContain('<TableHead>Books as</TableHead>');
    expect(panel).toContain('<TableHead>Decided</TableHead>');
    expect(panel).toContain("learned: 'accepted after a booking'");
    expect(panel).toContain('useAccountingTemplates');
    expect(panel).toMatch(/&& \(!!draft\.suggested_template_id \|\| !!draft\.suggested_account_code\.trim\(\)\)/);
  });

  it('the control dials are the approval rule and the trust level — one handle on the existing mechanism', () => {
    const dials = read('src/components/admin/accounting/ControlDialsCard.tsx');
    expect(dials).toContain('useJournalEntryApprovalRule');
    expect(read('src/hooks/useApprovals.ts')).toContain(".eq('entity_type', 'journal_entry')");
    expect(dials).toMatch(/const AGENT_BOOKING_SKILLS = \['manage_journal_entry', 'post_journal_entry', 'run_bookkeeping_sweep', 'book_unbooked_invoices'\] as const;/);
    expect(dials).toContain(".update({ trust_level: mode, requires_staging: mode === 'approve' })");
    expect(read('src/components/admin/accounting/SettingsTab.tsx')).toContain('<ControlDialsCard />');
  });
});
