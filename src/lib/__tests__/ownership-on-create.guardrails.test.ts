/**
 * Ownership must exist before any "mine" filter may — and must never become one.
 *
 * Measured before building: leads.assigned_to 0/7, deals.owner_id 0/5,
 * companies.account_owner 0/2. A "my deals" lens on that shows every
 * salesperson an empty list — a filter that reads as a security feature
 * working correctly. Step 0 makes ownership exist: creator owns on insert,
 * backfill from created_by, and an owner chip in every list so the left hand
 * SEES what the right hand does.
 *
 * Proven live on optic in a rolled-back transaction, four directions: a
 * logged-in salesperson's insert gets their uid; an explicit other owner is
 * respected; a service-role insert stays NULL (an agent must not guess); and
 * companies behaves like leads.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OWNERSHIP } from '@/lib/ownership';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const sql = read('supabase/migrations/20260808300000_ownership-on-create.sql');
const chip = read('src/components/admin/OwnerChip.tsx');

describe('the trigger assigns, and only when nothing was said', () => {
  it('fills the owner from auth.uid() per table', () => {
    expect(sql).toMatch(/IF NEW\.assigned_to IS NULL THEN NEW\.assigned_to := v_uid/);
    expect(sql).toMatch(/IF NEW\.owner_id IS NULL THEN NEW\.owner_id := v_uid/);
    expect(sql).toMatch(/IF NEW\.account_owner IS NULL THEN NEW\.account_owner := v_uid/);
  });

  it('never guesses for the agent path', () => {
    // Under the service role auth.uid() is NULL. An unowned record is visible
    // truth; a wrongly-owned one is a lie with an audit trail. Verified live:
    // a service-role deal insert came back owner_id NULL.
    expect(sql).toMatch(/IF v_uid IS NULL THEN\s*\n\s*RETURN NEW;/);
  });

  it('covers all three tables with BEFORE INSERT triggers', () => {
    for (const t of ['leads_assign_owner', 'deals_assign_owner', 'companies_assign_owner']) {
      expect(sql).toMatch(new RegExp(`CREATE TRIGGER ${t}\\s+BEFORE INSERT`));
    }
  });
});

describe('the backfill derives, never overwrites', () => {
  it('only fills NULL owners, from created_by only', () => {
    expect(sql).toMatch(/SET assigned_to\s*= created_by WHERE assigned_to\s*IS NULL AND created_by IS NOT NULL/);
    expect(sql).toMatch(/SET owner_id\s*= created_by WHERE owner_id\s*IS NULL AND created_by IS NOT NULL/);
    expect(sql).toMatch(/SET account_owner = created_by WHERE account_owner IS NULL AND created_by IS NOT NULL/);
  });
});

describe('ownership is a lens, never a rule', () => {
  it('this migration creates no RLS policy', () => {
    // Odoo wires "my records" into record rules — that is where salespeople
    // stop seeing each other's pipelines and start calling the same customer
    // twice. The whole design rests on this line staying out.
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it('no migration gates RLS on the CRM ownership columns', () => {
    // Scoped to policies ON leads/deals/companies. Other tables legitimately
    // use assignment in WRITE rules (picking_orders: only the assigned picker
    // updates the order — found by this guard's first, too-broad version). The
    // CRM lens columns are different: if this test ever fails, the failure IS
    // the design discussion.
    const dir = join(process.cwd(), 'supabase/migrations');
    const onCrm = /ON\s+(?:"?public"?\.)?"?(leads|deals|companies)"?\b/i;
    for (const f of readdirSync(dir)) {
      const body = readFileSync(join(dir, f), 'utf-8');
      for (const m of body.matchAll(/CREATE POLICY[\s\S]{0,600}?;/g)) {
        if (!onCrm.test(m[0])) continue;
        expect(m[0], `${f}: CRM policy references an ownership column`).not.toMatch(
          /\b(assigned_to|owner_id|account_owner)\b/,
        );
      }
    }
  });
});

describe('one map, three spellings', () => {
  it('names the wire columns without renaming them', () => {
    expect(OWNERSHIP.leads.column).toBe('assigned_to');
    expect(OWNERSHIP.deals.column).toBe('owner_id');
    expect(OWNERSHIP.companies.column).toBe('account_owner');
  });

  it('the chip writes through the map, not a literal column', () => {
    // A call site that spells its own column is how three entities drift.
    expect(chip).toMatch(/const \{ column \} = OWNERSHIP\[entity\]/);
    expect(chip).toMatch(/\.update\(\{ \[column\]: newOwner \}/);
  });
});

describe('the chip reaches the database and not the row underneath', () => {
  it('is wired into all three surfaces', () => {
    expect(read('src/pages/admin/LeadsPage.tsx')).toMatch(/<OwnerChip entity="leads" recordId=\{lead\.id\} ownerId=\{lead\.assigned_to\}/);
    expect(read('src/components/admin/DealKanbanCard.tsx')).toMatch(/<OwnerChip entity="deals" recordId=\{deal\.id\} ownerId=\{deal\.owner_id\}/);
    expect(read('src/pages/admin/CompaniesPage.tsx')).toMatch(/<OwnerChip entity="companies" recordId=\{company\.id\} ownerId=\{company\.account_owner\}/);
  });

  it('stops propagation, since rows and cards are clickable', () => {
    // Without this, assigning an owner also opens the record — or starts a
    // kanban drag.
    expect(chip).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
    expect(chip).toMatch(/onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  it('invalidates the entity queries after reassigning', () => {
    expect(chip).toMatch(/for \(const key of OWNERSHIP\[entity\]\.invalidate\)/);
  });
});
