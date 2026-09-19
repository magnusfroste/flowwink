import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Quote-to-cash and subscribe-to-renew, process battery 2026-09-19: an issued
 * invoice could be rewritten while its receivable stood in the ledger at the old
 * amount; a deposit reached the books only when the last krona arrived; a
 * cancelled invoice kept its entry; a payment without the "optional" reference
 * fell between two overloads; a declined quote could be invoiced; and proration
 * was measured against a period nobody had been billed for.
 *
 * The migrations prove the arithmetic on themselves. These pin the shapes.
 */

const root = join(__dirname, '../../..');
const files = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const migrations = files.map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');

function latestFunctionBody(fnName: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1; let m: RegExpExecArray | null;
  while ((m = re.exec(migrations))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const ends = ['$function$;', '$fn$;'].map((e) => migrations.indexOf(e, start)).filter((x) => x > -1);
  return migrations.slice(start, Math.min(...ends));
}

/** Signatures of fn that are created and never dropped afterwards, in migration order. */
function standingSignatures(fnName: string): string[] {
  const live = new Set<string>();
  const re = new RegExp(`(CREATE OR REPLACE FUNCTION|DROP FUNCTION(?: IF EXISTS)?) public\\.${fnName}\\(([^)]*)\\)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(migrations))) {
    const types = m[2].split(',').map((a) => {
      const t = a.trim().replace(/\s+DEFAULT.*$/i, '');
      const parts = t.split(/\s+/);
      const type = (parts.length > 1 && /^p_|^_/.test(parts[0]) ? parts.slice(1) : parts).join(' ');
      return type.replace(/timestamp with time zone/i, 'timestamptz').replace(/::.*$/, '').toLowerCase();
    }).filter(Boolean).join(',');
    if (/^DROP/i.test(m[1])) live.delete(types); else live.add(types);
  }
  return [...live];
}

describe('an issued invoice is a voucher', () => {
  it('lines, amounts, currency, number and date are frozen once the invoice leaves draft', () => {
    const t = latestFunctionBody('issued_invoice_is_final');
    expect(t).toMatch(/IF OLD\.status::text = 'draft' THEN RETURN NEW; END IF;/);
    for (const f of ['line_items', 'subtotal_cents', 'tax_cents', 'total_cents', 'currency', 'invoice_number', 'issue_date']) {
      expect(t, `${f} is not frozen`).toMatch(new RegExp(`NEW\\.${f}\\s+IS DISTINCT FROM OLD\\.${f}`));
    }
    expect(migrations).toMatch(/CREATE TRIGGER issued_invoice_is_final_trg\s+BEFORE UPDATE ON public\.invoices/);
  });

  it('a cancelled invoice gets its issue entry reversed, once', () => {
    expect(latestFunctionBody('book_invoice_cancelled')).toMatch(/source = 'invoice_cancelled'\) THEN\s+RETURN jsonb_build_object\('success', true, 'skipped'/);
    expect(latestFunctionBody('book_invoice_cancelled')).toMatch(/l\.credit_cents, l\.debit_cents/); // mirrored
    expect(latestFunctionBody('on_invoice_status_book')).toMatch(/IN \('cancelled', 'void'\) THEN[\s\S]*book_invoice_cancelled\(NEW\.id\)/);
  });
});

describe('every payment reaches the books the day it arrives', () => {
  it('book_invoice_paid books the DIFFERENCE between what is paid and what is already booked', () => {
    const b = latestFunctionBody('book_invoice_paid');
    expect(b).toMatch(/v_amount := COALESCE\(v_inv\.paid_amount_cents, 0\) - v_booked;/);
    expect(b).not.toMatch(/source = 'invoice_payment'\) THEN\s+RETURN jsonb_build_object\('success', true, 'skipped', 'already booked'\);\s+END IF;\s+IF v_inv\.order_id/);
  });

  it('record_invoice_payment books the payment it records', () => {
    expect(latestFunctionBody('record_invoice_payment')).toMatch(/public\.book_invoice_paid\(p_invoice_id, NULL, NULL, p_paid_at::date\)/);
  });

  it('no RPC a skill calls by name stands with two signatures where one is a prefix of the other', () => {
    // PostgREST resolves by argument NAMES: f(a,b,c) next to f(a,b,c,d DEFAULT …)
    // makes a call with {a,b,c} ambiguous. Discovered for the functions this
    // package touched; the shape is what matters.
    for (const fn of ['record_invoice_payment', 'book_invoice_paid', 'bulk_invoice_from_timesheets', 'change_subscription', 'generate_subscription_invoice']) {
      const sigs = standingSignatures(fn);
      expect(sigs.length, `${fn} stands with ${sigs.length} signatures: ${JSON.stringify(sigs)}`).toBe(1);
    }
  });
});

describe('only what the customer accepted is invoiced, and only what is approved is sent', () => {
  it('convert_to_invoice asks for an accepted quote', () => {
    const start = agentExecute.indexOf("if (action === 'convert_to_invoice') {");
    expect(agentExecute.slice(start, start + 1600)).toMatch(/String\(quote\.status\) !== 'accepted'/);
  });

  it('request_approval creates and links a real request; send refuses while it is pending', () => {
    const start = agentExecute.indexOf("      if (action === 'request_approval') {\n        // Same path as the admin UI");
    expect(start).toBeGreaterThan(-1);
    const req = agentExecute.slice(start, start + 3200);
    expect(req).toMatch(/from\('approval_requests'\)\.insert\(/);
    expect(req).toMatch(/approval_request_id: reqRow\.id/);
    const sendStart = agentExecute.lastIndexOf("if (action === 'send') {", start);
    expect(agentExecute.slice(sendStart, start)).toMatch(/=== 'pending_approval'[\s\S]*!== 'approved'/);
  });
});

describe('proration counts against the period that was billed', () => {
  it('the billed period ends where the pointer starts, and only exists once something is billed', () => {
    const c = latestFunctionBody('change_subscription');
    expect(c).toMatch(/_sub\.last_invoice_id IS NOT NULL AND _sub\.current_period_start IS NOT NULL/);
    expect(c).toMatch(/advance_billing_date\(_billed_end::date, _sub\.billing_interval, -COALESCE\(_sub\.billing_interval_count, 1\)\)/);
    expect(c).not.toMatch(/_sub\.current_period_end - now\(\)/); // the old, unbilled-period measure
  });

  it('a downgrade credit is accumulated and the next cycle invoice spends it', () => {
    expect(latestFunctionBody('change_subscription')).toMatch(/'pending_credit_cents', _pending/);
    const g = latestFunctionBody('generate_subscription_invoice');
    expect(g).toMatch(/_applied := LEAST\(GREATEST\(_pending, 0\), _gross\);/);
    expect(g).toMatch(/'pending_credit_cents', GREATEST\(_pending - _applied, 0\)/);
  });

  it('no VAT rate is a number in the code', () => {
    for (const fn of ['change_subscription', 'generate_subscription_invoice', 'bulk_invoice_from_timesheets']) {
      // as a default or a fallback (`:= 0.25`, `COALESCE(x, 0.25)`, `DEFAULT 0.25`) — a hint in an error text is fine
      expect(latestFunctionBody(fn), fn).not.toMatch(/(:=|,|DEFAULT)\s*0\.25\b/);
    }
  });
});
