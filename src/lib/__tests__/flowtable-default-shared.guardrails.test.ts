/**
 * Sharing is the default; private is the decision.
 *
 * Documents already worked this way (`visibility` defaults to 'shared').
 * Flowtable did not: `workspace_shared` defaulted to FALSE, so a base was born
 * invisible to everyone but its author — staying private took no decision while
 * sharing took one per base. That inverts what a shared operating platform is
 * for: the transparency, and the context an agent needs to act on the
 * business's behalf. A base nobody can see is one FlowPilot cannot reason about.
 *
 * The whole tree hangs off one helper — can_access_flowtable_base() resolves
 * "owner OR shared" and the tables/fields/records policies all defer to it — so
 * the default is the only thing that moves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const strip = (s: string) => s.replace(/--[^\n]*/g, '');

const sql = strip(read('supabase/migrations/20260810110000_flowtable-default-shared.sql'));
// Comments are stripped before any assertion about the code: a negative
// assertion trips on the very comment that explains what was removed. That
// exact trap has fired twice in this repo — once on a policy body, once on a
// docstring mentioning localStorage.
const page = read('src/pages/admin/FlowtablePage.tsx')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/[^\n]*$/gm, '');

describe('a new base is shared unless someone decides otherwise', () => {
  it('flips the column default to true', () => {
    expect(sql).toMatch(/ALTER TABLE public\.flowtable_bases\s+ALTER COLUMN workspace_shared SET DEFAULT true/);
  });

  it('matches how documents already behave', () => {
    // documents.visibility defaults to 'shared'. One platform, one rule.
    expect(sql).not.toMatch(/SET DEFAULT false/i);
  });
});

describe('history is not republished', () => {
  it('does not backfill existing private bases', () => {
    // A base sitting at FALSE may be private by choice or by the old default,
    // and nothing records which. Publishing a sheet someone meant to keep
    // private cannot be undone; leaving one private for another day is a
    // switch. The asymmetry decides it — same as the allowlist's fail-closed.
    expect(sql).not.toMatch(/UPDATE\s+public\.flowtable_bases/i);
    expect(sql).not.toMatch(/SET workspace_shared\s*=\s*true/i);
  });

  it('changes no policy — the access helper already said "owner or shared"', () => {
    expect(sql).not.toMatch(/CREATE POLICY|DROP POLICY|can_access_flowtable_base/);
  });
});

describe('the UI marks the exception, not the rule', () => {
  it('badges a private base with a lock instead of badging every shared one', () => {
    expect(page).toMatch(/!b\.workspace_shared && \(/);
    expect(page).toMatch(/<Lock className="h-3 w-3/);
  });

  it('labels the switch by its actual state, in both directions', () => {
    // "Share with workspace" read as an invitation to opt in — backwards once
    // the switch is how you opt OUT.
    expect(page).toMatch(/Shared with colleagues/);
    expect(page).toMatch(/Private to you/);
    expect(page).not.toMatch(/Share with workspace/);
  });

  it('says what private costs — the agent loses sight of it too', () => {
    expect(page).toMatch(/neither can FlowPilot/);
  });
});
