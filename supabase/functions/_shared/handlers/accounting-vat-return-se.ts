// prepare_vat_return — internal skill handler.
//
// Swedish VAT return (Momsdeklaration) — SKV 4700. Sums posted
// journal_entry_lines per BAS 2024 account for a period and maps them to the
// boxes declared in src/lib/locale-packs/se/vat-return-2026.ts. The mapping is
// versioned data in the locale pack; this handler is pure engine.
//
// Moved VERBATIM from the standalone `accounting-vat-return-se` edge function
// (edge-surface refactor B1a, wave 2). NB the localization-discipline law
// (country = data + adapters, engine never branches on country) still wants
// the box map to move into the locale pack — that is a SEPARATE refactor; this
// move changes nothing about behavior.
//
// Input:  { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
//     or  { year: 2026, month: 1..12 }
//     or  { year: 2026, quarter: 1..4 }
// Output: { period, form, version, boxes: [{code,label,amount_cents,kind}],
//           net_to_pay_cents, direction, verification }

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { SE_VAT_BOXES_2026 as BOXES_2026, type BoxDef, type BoxKind } from '../locale/se-vat-boxes.ts';
// Box map moved to _shared/locale/se-vat-boxes.ts so it exists exactly ONCE —
// the duplicate that used to live here drifted from the pack and shipped a bug.


// ─── Period resolution ──────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0'); }
function lastDayOfMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

export function resolvePeriod(input: any): { from: string; to: string } {
  if (input?.from && input?.to) return { from: input.from, to: input.to };
  const y = Number(input?.year);
  if (!y || !Number.isFinite(y)) {
    // Self-correcting error (CLAUDE.md): the model is usually told to prepare
    // "the current VAT period" but has no reliable notion of today's date, so
    // it called with no period at all (liteit heartbeat, 2026-07-19, ×3).
    // Name the concrete current periods so the next turn passes explicit args —
    // a statutory draft must never silently assume a period.
    const now = new Date();
    const cy = now.getUTCFullYear();
    const cm = now.getUTCMonth() + 1;
    const cq = Math.floor((cm - 1) / 3) + 1;
    throw new Error(
      `A VAT period is required. Pass {from,to} (ISO dates) or {year,month} or {year,quarter}. ` +
      `For the CURRENT period: this month = {year:${cy}, month:${cm}}; this quarter = {year:${cy}, quarter:${cq}}; ` +
      `this year = {year:${cy}}. Pick the one matching the company's reporting frequency.`,
    );
  }
  if (input?.month) {
    const m = Number(input.month);
    return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}` };
  }
  if (input?.quarter) {
    const q = Number(input.quarter);
    const mStart = (q - 1) * 3 + 1;
    const mEnd = mStart + 2;
    return { from: `${y}-${pad2(mStart)}-01`, to: `${y}-${pad2(mEnd)}-${pad2(lastDayOfMonth(y, mEnd))}` };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function executeVatReturnSe(
  sb: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const body = args as Record<string, any>;
    // Accept both flat and p_-prefixed args (agent-execute may pass either)
    const input = {
      from: body.from ?? body.p_from,
      to: body.to ?? body.p_to,
      year: body.year ?? body.p_year,
      month: body.month ?? body.p_month,
      quarter: body.quarter ?? body.p_quarter,
    };
    const { from, to } = resolvePeriod(input);

    const { data: localeRow } = await sb
      .from('site_settings').select('value').eq('key', 'accounting_locale').maybeSingle();
    const locale = (localeRow?.value as string) || 'se-bas2024';

    // ── Which accounts feed which box: the INSTANCE decides ────────────────
    // The lists in SE_VAT_BOXES_2026 are the standard's answer for a standard
    // chart. A company that migrated from another system books VAT to accounts
    // outside them, and the amount used to vanish from the return with no error
    // — silence, on a statutory filing. account_tax_boxes holds the same map as
    // data, seeded verbatim from the pack, extensible per company.
    //
    // The code map remains the fallback for an instance that has not run the
    // migration yet, so a half-deployed fleet keeps filing correctly rather
    // than filing zeroes.
    const boxAccounts = new Map<string, Set<string>>();
    let mapSource = 'account_tax_boxes';
    {
      const { data: rows } = await sb
        .from('account_tax_boxes')
        .select('box_code, account_code')
        .eq('locale', locale);
      if (rows && rows.length) {
        for (const r of rows as { box_code: string; account_code: string }[]) {
          if (!boxAccounts.has(r.box_code)) boxAccounts.set(r.box_code, new Set());
          boxAccounts.get(r.box_code)!.add(r.account_code);
        }
      } else {
        mapSource = 'locale pack (account_tax_boxes not seeded on this instance)';
        for (const b of BOXES_2026) {
          if (!b.accounts?.length) continue;
          boxAccounts.set(b.code, new Set(b.accounts));
        }
      }
    }
    const accountsFor = (b: BoxDef): string[] => Array.from(boxAccounts.get(b.code) ?? []);

    const accountCodes = new Set<string>();
    for (const set of boxAccounts.values()) for (const a of set) accountCodes.add(a);

    // Sum debits/credits per account for posted entries in period.
    // journal_entry_lines has account_code; join to journal_entries for
    // entry_date + status filter.
    let all: { account_code: string; debit_cents: number; credit_cents: number }[] = [];
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await sb
        .from('journal_entry_lines')
        .select('account_code, debit_cents, credit_cents, journal_entries!inner(entry_date, status)')
        .in('account_code', Array.from(accountCodes))
        .gte('journal_entries.entry_date', from)
        .lte('journal_entries.entry_date', to)
        .eq('journal_entries.status', 'posted')
        .range(offset, offset + PAGE - 1);
      if (error) return { error: error.message };
      if (!data || data.length === 0) break;
      all = all.concat(data.map((r: any) => ({
        account_code: r.account_code,
        debit_cents: Number(r.debit_cents) || 0,
        credit_cents: Number(r.credit_cents) || 0,
      })));
      if (data.length < PAGE) break;
      offset += PAGE;
    }

    // Aggregate per account
    const perAccount = new Map<string, { debit: number; credit: number }>();
    for (const l of all) {
      const cur = perAccount.get(l.account_code) ?? { debit: 0, credit: 0 };
      cur.debit += l.debit_cents;
      cur.credit += l.credit_cents;
      perAccount.set(l.account_code, cur);
    }

    // Compute per box
    const boxAmounts = new Map<string, number>();
    const boxOut: { code: string; label: string; kind: BoxKind; amount_cents: number }[] = [];

    // First pass: account-based boxes
    for (const b of BOXES_2026) {
      if (b.kind === 'output_vat') {
        let sum = 0;
        for (const a of accountsFor(b)) {
          const p = perAccount.get(a); if (!p) continue;
          sum += (p.credit - p.debit);
        }
        boxAmounts.set(b.code, sum);
      } else if (b.kind === 'input_vat') {
        let sum = 0;
        for (const a of accountsFor(b)) {
          const p = perAccount.get(a); if (!p) continue;
          sum += (p.debit - p.credit);
        }
        boxAmounts.set(b.code, sum);
      } else if (b.kind === 'base_credit') {
        let sum = 0;
        for (const a of accountsFor(b)) {
          const p = perAccount.get(a); if (!p) continue;
          sum += (p.credit - p.debit);
        }
        boxAmounts.set(b.code, sum);
      } else if (b.kind === 'base_debit') {
        let sum = 0;
        for (const a of accountsFor(b)) {
          const p = perAccount.get(a); if (!p) continue;
          sum += (p.debit - p.credit);
        }
        boxAmounts.set(b.code, sum);
      }
    }
    // Second pass: derived boxes
    for (const b of BOXES_2026) {
      if (b.kind === 'base_from_vat') {
        let sum = 0;
        for (const d of b.derive_from!) {
          const vat = boxAmounts.get(d.box) ?? 0;
          if (d.rate > 0) sum += Math.round(vat / d.rate);
        }
        boxAmounts.set(b.code, sum);
      } else if (b.kind === 'computed') {
        let sum = 0;
        for (const [code, sign] of Object.entries(b.formula!)) {
          sum += (sign as number) * (boxAmounts.get(code) ?? 0);
        }
        boxAmounts.set(b.code, sum);
      }
    }

    for (const b of BOXES_2026) {
      boxOut.push({
        code: b.code, label: b.label, kind: b.kind,
        amount_cents: boxAmounts.get(b.code) ?? 0,
      });
    }

    const outputTotal =
      (boxAmounts.get('10') ?? 0) + (boxAmounts.get('11') ?? 0) + (boxAmounts.get('12') ?? 0) +
      (boxAmounts.get('30') ?? 0) + (boxAmounts.get('31') ?? 0) + (boxAmounts.get('32') ?? 0);
    const inputTotal = boxAmounts.get('48') ?? 0;
    const netToPay = boxAmounts.get('49') ?? 0;

    // Internal consistency: box 49 should = outputTotal - inputTotal
    const verification = {
      output_vat_cents: outputTotal,
      input_vat_cents: inputTotal,
      net_cents: outputTotal - inputTotal,
      matches_box_49: (outputTotal - inputTotal) === netToPay,
    };

    // A return that only sums the accounts it knows about cannot tell you about
    // the ones it does not. vat_box_coverage looks at what actually MOVED in the
    // period and reports anything reportable that belongs to no box — the exact
    // amount a migrated chart loses silently. It rides along with the filing
    // because that is where someone is looking; a separate command would be run
    // by the people who already knew to worry.
    let coverage: unknown = null;
    const { data: cov, error: covErr } = await sb.rpc('vat_box_coverage', {
      p_from: from, p_to: to, p_locale: locale,
    });
    if (covErr) {
      coverage = {
        checked: false,
        note: `Coverage could not be checked on this instance (${covErr.message}). ` +
          'The box amounts above are still correct for the accounts that ARE mapped — ' +
          'what is unverified is whether anything was posted outside the map.',
      };
    } else {
      coverage = cov;
    }

    return {
      form: 'SKV 4700',
      version: '2026',
      period: { from, to },
      boxes: boxOut,
      net_to_pay_cents: netToPay,
      direction: netToPay >= 0 ? 'pay_to_skatteverket' : 'refund_from_skatteverket',
      verification,
      coverage,
      box_map_source: mapSource,
      note: 'Sums posted journal_entry_lines per the account→box map (account_tax_boxes). Verify against 2650 control account before filing; then book the payment via manage_journal_entry (template "Momsredovisning (betalning)").',
    };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}
