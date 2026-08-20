/**
 * Guardrails: a skill's metadata must describe the skill that exists.
 *
 * Law 2 says skills are self-describing, which is only useful if what they say
 * is true. Three lies were caught in one QA sweep (2026-08-20), each of which
 * cost an agent a full round or an outright wrong answer:
 *
 *  - manage_inventory advertised an action (`low_stock`) that no handler branch
 *    answered to. The contract itself sent callers into "Unknown action".
 *  - Four NOT-for markers pointed at `receive_goods`, a skill deleted in May.
 *    A phantom in a NOT-for is worse than no NOT-for: it names a destination
 *    that cannot be reached.
 *  - send_invoice_for_order returned `sent: true` unconditionally, including
 *    when the router had just reported that no provider was configured and
 *    nothing had been sent.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import artifact from '../../../supabase/seed/module-skills.json';

interface Seed {
  name: string;
  description?: string;
  instructions?: string;
  tool_definition?: {
    function?: {
      description?: string;
      parameters?: { properties?: Record<string, { enum?: string[] }> };
    };
  };
}

const seeds: Seed[] = (artifact as { modules: Array<{ skills: Seed[] }> })
  .modules.flatMap((m) => m.skills);
const byName = new Map(seeds.map((s) => [s.name, s]));
const agentExecute = readFileSync(
  join(process.cwd(), 'supabase/functions/agent-execute/index.ts'),
  'utf8',
);

describe('declared actions exist in the handler', () => {
  it('manage_inventory declares exactly the branches executeProductsAction answers to', () => {
    const declared = byName.get('manage_inventory')
      ?.tool_definition?.function?.parameters?.properties?.action?.enum;
    expect(declared).toEqual([
      'list_stock',
      'update_stock',
      'low_stock_alerts',
      'back_in_stock_requests',
    ]);
    for (const action of declared!) {
      expect(
        agentExecute.includes(`action === '${action}'`),
        `manage_inventory advertises "${action}" but no handler branch matches it`,
      ).toBe(true);
    }
  });

  it('the retired `low_stock` name still works, and the error names what does', () => {
    expect(agentExecute).toMatch(/rawAction === 'low_stock' \? 'low_stock_alerts' : rawAction/);
    expect(agentExecute).toMatch(/valid_actions: \['list_stock', 'update_stock', 'low_stock_alerts', 'back_in_stock_requests'\]/);
  });
});

describe('cross-references point at skills that exist', () => {
  // A ratchet, not a clean sheet. Sweeping the catalog for "(use X)" pointers
  // turned up 20 more of them beyond the four this session was sent to fix —
  // some plain phantoms (seo_audit, get_exchange_rate), some plural near-misses
  // the executor's inflection tolerance happens to absorb (manage_projects →
  // manage_project). They live in a dozen modules other work is touching, so
  // they are recorded rather than silently swept: this list may SHRINK freely,
  // and anything new fails the build.
  const KNOWN_DANGLING = new Set([
    'seo_content_brief → seo_audit',
    'manage_contract → manage_projects',
    'manage_document → manage_media',
    'cart_recovery_check → check_order',
    'submit_expense_report → generate_expense_report',
    'queue_beta_test → openclaw_test',
    'register_fixed_asset → expenses',
    'register_fixed_asset → bills',
    'set_exchange_rate → get_exchange_rate',
    'manage_project_task → manage_crm_tasks',
    'register_vendor_invoice → create_invoice',
    'flag_invoice_variance → get_invoice',
    'manage_job_posting → manage_application',
    'post_to_river → manage_tickets',
    'sales_profile_setup → manage_business_identity',
    'log_time → manage_projects',
    'generate_blog_from_webinar → manage_blog',
  ]);

  const danglingPointers = (): string[] => {
    const known = new Set(seeds.map((s) => s.name));
    const out = new Set<string>();
    for (const s of seeds) {
      const text = `${s.description ?? ''} ${s.tool_definition?.function?.description ?? ''}`;
      for (const m of text.matchAll(/\(use ([a-z][a-z0-9_]{4,})\)/g)) {
        if (!known.has(m[1])) out.add(`${s.name} → ${m[1]}`);
      }
    }
    return [...out];
  };

  it('no NEW pointer at a non-existent skill', () => {
    const introduced = danglingPointers().filter((d) => !KNOWN_DANGLING.has(d));
    expect(
      introduced,
      `A "(use X)" pointer names a skill that does not exist:\n${introduced.join('\n')}\n` +
        'Point at the real skill name — a phantom in a NOT-for is worse than no NOT-for.',
    ).toEqual([]);
  });

  it('receive_goods is gone and nothing points at it any more', () => {
    expect([...byName.keys()]).not.toContain('receive_goods');
    const all = JSON.stringify(artifact);
    expect(all).not.toContain('receive_goods');
    expect(byName.get('receive_purchase_order')).toBeDefined();
  });
});

describe('a skill reports what happened, not what it attempted', () => {
  it('send_invoice_for_order derives `sent` from the email result', () => {
    expect(agentExecute).toMatch(/const emailSent = \(emailResult as \{ sent\?: boolean \}\)\?\.sent === true;/);
    expect(agentExecute).toMatch(/\n    sent: emailSent,/);
    // Creating the invoice and emailing it are two facts, reported separately.
    expect(agentExecute).toMatch(/invoice_created: true,/);
    // …and the skill's own instructions say so, so the model reads the flag.
    expect(byName.get('send_invoice_for_order')?.instructions)
      .toMatch(/two different facts/i);
  });
});

describe('the intent boundaries QA saw crossed are stated', () => {
  it('manage_service_order rules out the three order shapes it hijacked', () => {
    const d = byName.get('manage_service_order')?.description ?? '';
    for (const rival of ['place_order', 'create_return', 'create_purchase_order']) {
      expect(d, `manage_service_order must say it is NOT for ${rival}`).toContain(rival);
    }
  });

  it('place_order covers staff registering an order on a customer\'s behalf', () => {
    expect(byName.get('place_order')?.description ?? '')
      .toMatch(/on behalf of a customer|staff registers an order/i);
  });

  it('create_return names the RMA vocabulary a user actually types', () => {
    const d = byName.get('create_return')?.description ?? '';
    expect(d.toLowerCase()).toContain('rma');
    expect(d.toLowerCase()).toContain('return authorization');
  });
});
