import { describe, it, expect } from 'vitest';
import { isReadSkill, isReadCall, WRITE_REFUSAL } from '../../../supabase/functions/_shared/skills/read-surface';

/**
 * FlowWork mounts the MCP gateway's dispatch pattern INSIDE the employee chat:
 * search_skills → read_skill → execute_skill. The execute step is gated by
 * this surface, fail-closed — a colleague asking "has this customer paid?"
 * must never trigger a send, a booking or a deletion because a model chose an
 * eager tool.
 *
 * These tests are the contract. If one starts failing, the gate moved.
 */

describe('the read surface is fail-closed', () => {
  it('lets the read verbs through', () => {
    for (const name of [
      'list_tickets',
      'get_customer_360',
      'search_wiki',
      'browse_blog',
      'query_flowtable',
      'list_fiscal_years',
      'find_duplicate_companies',
      'check_integrations',
    ]) {
      expect(isReadSkill(name), name).toBe(true);
    }
  });

  it('refuses every write shape the catalog actually contains', () => {
    for (const name of [
      'manage_journal_entry',
      'create_checkout',
      'send_invoice',
      'write_blog_post',
      'book_expense_report',
      'approve_expense_report',
      'execute_newsletter_send',
      'refund_return',
      'upload_document',
      'run_year_end',
      'record_accounting_correction',
    ]) {
      expect(isReadSkill(name), name).toBe(false);
    }
  });

  it('unknown and empty names are refused, not defaulted', () => {
    expect(isReadSkill('')).toBe(false);
    expect(isReadSkill('some_future_skill')).toBe(false);
    expect(isReadSkill(undefined as unknown as string)).toBe(false);
  });

  it('a read prefix does not launder a dangerous name', () => {
    // The deny pattern overrides the prefix convention: convention is
    // evidence, these words are counter-evidence.
    for (const name of [
      'get_api_keys',
      'list_credentials',
      'get_site_secrets',
      'check_password',
      'find_and_delete_duplicates',
      'get_reset_token',
    ]) {
      expect(isReadSkill(name), name).toBe(false);
    }
  });

  it('explicit extras are reads even without the prefix', () => {
    for (const name of ['accounting_reports', 'ar_aging_report', 'year_end_readiness', 'prepare_vat_return']) {
      expect(isReadSkill(name), name).toBe(true);
    }
  });

  it('the refusal teaches the model to propose instead', () => {
    expect(WRITE_REFUSAL).toMatch(/read-only/i);
    expect(WRITE_REFUSAL).toMatch(/propose|Describe the action/i);
  });
});

describe('the call gate judges manage_* by its action', () => {
  it('a manage skill with an explicit read action passes', () => {
    expect(isReadCall('manage_ticket', { action: 'list', status: 'open' })).toBe(true);
    expect(isReadCall('manage_invoice', { action: 'get', invoice_number: 'X' })).toBe(true);
    expect(isReadCall('manage_journal_entry', { action: 'list' })).toBe(true);
  });

  it('a write action — or NO action — fails closed', () => {
    // We refuse to bet on a handler's default branch.
    expect(isReadCall('manage_ticket', { action: 'create' })).toBe(false);
    expect(isReadCall('manage_ticket', {})).toBe(false);
    expect(isReadCall('manage_ticket', undefined)).toBe(false);
    expect(isReadCall('manage_journal_entry', { action: 'void' })).toBe(false);
  });

  it('non-manage writes stay refused regardless of action smuggling', () => {
    expect(isReadCall('send_invoice', { action: 'list' })).toBe(false);
    expect(isReadCall('write_blog_post', { action: 'get' })).toBe(false);
  });

  it('plain read skills pass without any action', () => {
    expect(isReadCall('list_fiscal_years')).toBe(true);
    expect(isReadCall('get_customer_360', { company: 'Acme' })).toBe(true);
  });
});

describe('workspace-chat mounts the surface', () => {
  it('execute_skill is gated by isReadSkill and runs as flowwork', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const src = readFileSync(
      join(__dirname, '../../../supabase/functions/workspace-chat/index.ts'),
      'utf8',
    );
    // The gate must sit inside the executor, not in the prompt.
    expect(src).toMatch(/if \(!isReadCall\(name, args\)\) return \{ ok: false, body: \{ error: WRITE_REFUSAL \}, name \};/);
    // The activity trail must name the surface, so agent_activity shows WHO acted.
    expect(src).toMatch(/agent_type: 'flowwork'/);
    expect(src).toMatch(/caller_user_id: userId/);
    // Live entity lanes read with the caller's eyes, not the service key.
    expect(src).toMatch(/const live = opts\.userClient \?\? supabase;/);
    expect(src).not.toMatch(/await supabase\s*\n\s*\.from\('contracts'\)/);
    expect(src).not.toMatch(/await supabase\s*\n\s*\.from\('employees'\)/);
  });
});
