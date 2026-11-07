/**
 * Open doors without visitors (2026-11-07): a security pass with the advisor's
 * own questions found four things open that nothing in the browser used — the
 * public feedback board's anon write policies (the board writes through
 * content-api; the DELETE policy's `true` let anyone delete every vote), a
 * SECURITY DEFINER view of RMAs readable by anon, three more definer views
 * that handed staff data to any `authenticated` caller (a portal customer is
 * one), and a definer RPC content-api calls as the service role but anon
 * could call too. Migration 20261107130000 closes them; this keeps it so.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(__dirname, '../../../supabase/migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const fix = files.find((f) => f.includes('oppna-dorrar-utan-besokare'))!;
const sql = readFileSync(resolve(DIR, fix), 'utf8');

describe('open doors without visitors', () => {
  it('the board writes through content-api only — no anon write policy on feedback tables', () => {
    for (const p of ['anyone posts to the board', 'anyone comments on the board', 'anyone votes on the board', 'a voter withdraws a vote']) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${p}"`);
    }
    // No later migration reopens one.
    const later = files.filter((f) => f > fix);
    for (const f of later) {
      const s = readFileSync(resolve(DIR, f), 'utf8');
      expect(s, f).not.toMatch(/create\s+policy[^;]*on\s+public\.feedback_(posts|comments|votes)[^;]*for\s+(insert|update|delete|all)[^;]*to\s+[^;]*\banon\b/i);
    }
  });

  it('the four definer views read as their caller and anon has no grant', () => {
    for (const v of ['returns_awaiting_inspection', 'contract_obligations_with_status', 'v_expiring_lots', 'v_vendor_scorecard']) expect(sql).toContain(`'${v}'`);
    expect(sql).toMatch(/ALTER VIEW public\.%I SET \(security_invoker = true\)/);
    expect(sql).toMatch(/REVOKE ALL ON public\.%I FROM anon/);
  });

  it('feedback_record_ping is the service role\'s', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.feedback_record_ping\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.feedback_record_ping\([^)]*\) TO service_role/);
  });

  it('the board still goes through content-api, not the tables', () => {
    const hook = readFileSync(resolve(__dirname, '../../hooks/useFeedbackBoard.ts'), 'utf8');
    expect(hook).toMatch(/functions\/v1\/content-api\/feedback/);
    expect(hook).not.toMatch(/from\(['"]feedback_/);
  });
});
