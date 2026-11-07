/**
 * Guardrail: lead_status alias mapping in agent-execute > executeLeadsAction.
 *
 * The DB enum public.lead_status = (lead, opportunity, customer, lost).
 * The agent (Anna persona, MCP callers, FlowPilot reasoning) frequently
 * proposes intuitive but non-canonical values like "new", "qualified",
 * "won", "disqualified", "open", "all". The handler MUST normalize these
 * before hitting the DB to avoid `invalid input value for enum lead_status`.
 *
 * Mirror: supabase/functions/_shared/execute/core.ts (LEAD_STATUS_ALIASES /
 * normalizeLeadStatus) and the tool_definition for skill `manage_leads`.
 */
import { describe, expect, it } from 'vitest';

const LEAD_STATUS_ALIASES: Record<string, string> = {
  lead: 'lead',
  opportunity: 'opportunity',
  customer: 'customer',
  lost: 'lost',
  new: 'lead',
  unqualified: 'lead',
  contacted: 'lead',
  qualified: 'opportunity',
  open: 'opportunity',
  active: 'opportunity',
  negotiation: 'opportunity',
  proposal: 'opportunity',
  won: 'customer',
  closed_won: 'customer',
  'closed-won': 'customer',
  client: 'customer',
  disqualified: 'lost',
  closed_lost: 'lost',
  'closed-lost': 'lost',
  rejected: 'lost',
};

function normalizeLeadStatus(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null;
  const key = String(input).trim().toLowerCase();
  if (key === 'all' || key === 'any' || key === '*') return null;
  return LEAD_STATUS_ALIASES[key] ?? key;
}

const CANONICAL = ['lead', 'opportunity', 'customer', 'lost'] as const;

describe('manage_leads — lead_status normalization', () => {
  it('passes canonical enum values through unchanged', () => {
    for (const v of CANONICAL) expect(normalizeLeadStatus(v)).toBe(v);
  });

  it('maps the failing real-world values from agent_activity', () => {
    expect(normalizeLeadStatus('new')).toBe('lead');           // Anna list-call
    expect(normalizeLeadStatus('disqualified')).toBe('lost');  // Anna update-call
  });

  it('maps common pipeline aliases', () => {
    expect(normalizeLeadStatus('qualified')).toBe('opportunity');
    expect(normalizeLeadStatus('open')).toBe('opportunity');
    expect(normalizeLeadStatus('won')).toBe('customer');
    expect(normalizeLeadStatus('closed-won')).toBe('customer');
    expect(normalizeLeadStatus('closed_lost')).toBe('lost');
    expect(normalizeLeadStatus('rejected')).toBe('lost');
  });

  it('treats "all" / "any" / "*" / empty / null as no-filter (null)', () => {
    expect(normalizeLeadStatus('all')).toBeNull();
    expect(normalizeLeadStatus('any')).toBeNull();
    expect(normalizeLeadStatus('*')).toBeNull();
    expect(normalizeLeadStatus('')).toBeNull();
    expect(normalizeLeadStatus(null)).toBeNull();
    expect(normalizeLeadStatus(undefined)).toBeNull();
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizeLeadStatus('  NEW  ')).toBe('lead');
    expect(normalizeLeadStatus('Customer')).toBe('customer');
    expect(normalizeLeadStatus('LOST')).toBe('lost');
  });

  it('returns lowercased raw value for truly unknown inputs (DB will reject — correct)', () => {
    // We do NOT swallow unknown values; the DB enum stays the source of truth.
    expect(normalizeLeadStatus('martian')).toBe('martian');
  });

  it('all alias targets are valid canonical enum values', () => {
    for (const target of Object.values(LEAD_STATUS_ALIASES)) {
      expect(CANONICAL).toContain(target as typeof CANONICAL[number]);
    }
  });
});
