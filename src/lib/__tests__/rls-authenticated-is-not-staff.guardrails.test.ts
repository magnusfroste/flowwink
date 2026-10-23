import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * "authenticated" is not "staff".
 *
 * Verified live 2026-10-22: a self-registered portal customer read `employees`
 * (personal numbers, salaries) and every `profiles` row, through a hundred
 * SELECT policies that said `TO authenticated USING (true)`. They were written
 * when every logged-in user was an employee; the customer portal made
 * "authenticated" mean the public. Migration 20261022010000 rewrote the internal
 * ones to `is_staff(auth.uid())`.
 *
 * This pins two things: the migration still carries the fix for the tables
 * that matter most, and no LATER migration reopens one of them with an
 * unconditional read for every logged-in user. Reference tables (currencies,
 * units, tax codes) may stay open; the list below is the sensitive set.
 */
const root = resolve(__dirname, '../../..');
const dir = resolve(root, 'supabase/migrations');
const FIX = '20261022010000_sakerhetssvepet-rollen-kommer-fran-app-metadata.sql';

const SENSITIVE = [
  'employees', 'employee_documents', 'leave_requests', 'onboarding_checklists', 'journal_entry_lines',
  'payment_reconciliations', 'opening_balances', 'agent_memory', 'agent_automations', 'agent_objectives',
  'approval_requests', 'activities', 'crm_tasks', 'inbound_email_accounts', 'voicemail_messages',
  'deal_history', 'content_research', 'pages', 'page_versions', 'blog_posts', 'handbook_chapters',
  'river_posts', 'beta_test_sessions', 'beta_test_findings', 'beta_test_exchanges',
];

describe('the fix migration', () => {
  const sql = readFileSync(resolve(dir, FIX), 'utf-8');
  it('moves the signup role request to app_metadata and gates the sensitive tables on is_staff', () => {
    expect(sql).toMatch(/raw_app_meta_data ->> 'signup_type'/);
    expect(sql).not.toMatch(/raw_user_meta_data ->> 'signup_type'/);
    for (const t of SENSITIVE.filter((t) => !t.startsWith('beta_test'))) {
      expect(sql, t).toMatch(new RegExp(`\\('${t}',\\s*'[^']+'\\)`));
    }
    expect(sql).toMatch(/USING \(public\.is_staff\(auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.register_visitor_intent_trigger\(text, text\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Public can view items via quote token" ON public\.quote_items/);
    expect(sql).toMatch(/REVOKE SELECT ON public\.quote_items FROM anon/);
  });
});

describe('no later migration reopens a sensitive table to every logged-in user', () => {
  const later = readdirSync(dir).filter((f) => f.endsWith('.sql') && f > FIX).sort();
  it('scans every migration after the fix', () => {
    const offenders: string[] = [];
    for (const f of later) {
      const sql = readFileSync(resolve(dir, f), 'utf-8').replace(/--[^\n]*/g, '');
      const re = /CREATE POLICY\s+"[^"]+"\s+ON\s+(?:public\.)?("?)([a-z_]+)\1[\s\S]{0,200}?FOR\s+SELECT[\s\S]{0,120}?TO\s+(authenticated|public)[\s\S]{0,80}?USING\s*\(\s*(true|auth\.uid\(\)\s+IS\s+NOT\s+NULL)\s*\)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql))) {
        if (SENSITIVE.includes(m[2])) offenders.push(`${f}: ${m[2]}`);
      }
    }
    expect(offenders, 'an unconditional SELECT for every logged-in user on a sensitive table — use is_staff(auth.uid()) or can_access_module').toEqual([]);
  });
});
