/**
 * Guardrail: finding attribution is derived from the authenticated key, not
 * self-reported (supabase/functions/agent-execute/index.ts, report_finding).
 *
 * OpenClaw's findings landed reported_by=NULL because the handler trusted a
 * `reported_by` arg the agent had to pass itself — and a self-reported
 * identity is also forgeable (any peer could claim another's slug). The fix
 * resolves attribution from `_caller_api_key_id` (the authenticated key),
 * honoring a claimed slug only when the key's own name corroborates it. These
 * tripwires lock that: the raw arg must never flow straight into the insert,
 * and the corroboration path must stay in place.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  join(__dirname, '../../../supabase/functions/agent-execute/index.ts'),
  'utf-8',
);

describe('finding attribution guardrails', () => {
  it('report_finding derives reported_by via resolveReportedBy, not the raw arg', () => {
    // The insert must use the derived value…
    expect(src).toMatch(/reported_by:\s*reportedBy\b/);
    // …and must NOT insert the caller-supplied arg directly.
    expect(src).not.toMatch(/reported_by:\s*reported_by\s*\|\|\s*null/);
  });

  it('resolveReportedBy authenticates against the api_key, not the claim', () => {
    const fn = src.slice(src.indexOf('async function resolveReportedBy'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // Reads the authenticated key identity.
    expect(body).toContain('_caller_api_key_id');
    expect(body).toMatch(/from\(['"]api_keys['"]\)/);
    // Claimed slug is gated behind corroboration by the authenticated name.
    expect(body).toMatch(/authLower\.includes\(claimed\)/);
  });

  it('slugify strips the federation key-name template to the peer slug', () => {
    // "MCP key for peer OpenClaw" must not become the reported_by verbatim.
    const fn = src.slice(src.indexOf('function slugifyAgentName'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('mcp key for peer');
  });
});
