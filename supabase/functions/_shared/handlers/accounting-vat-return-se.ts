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

type BoxKind =
  | 'output_vat' | 'input_vat'
  | 'base_from_vat' | 'base_credit' | 'base_debit'
  | 'computed';

interface BoxDef {
  code: string;
  label: string;
  kind: BoxKind;
  accounts?: string[];
  derive_from?: { box: string; rate: number }[];
  formula?: Record<string, 1 | -1>;
}

const BOXES_2026: BoxDef[] = [
  { code: '05', label: 'Momspliktig försäljning ex moms', kind: 'base_from_vat',
    derive_from: [{ box: '10', rate: 0.25 }, { box: '11', rate: 0.12 }, { box: '12', rate: 0.06 }] },

  { code: '20', label: 'Inköp av varor från annat EU-land', kind: 'base_debit',
    accounts: ['4515','4516','4517','4518'] },
  { code: '21', label: 'Inköp av tjänster från annat EU-land', kind: 'base_debit',
    accounts: ['4531','4532','4535','4536'] },
  { code: '22', label: 'Import av varor (beskattningsunderlag)', kind: 'base_debit',
    accounts: ['4545','4546','4547'] },

  { code: '35', label: 'Försäljning av varor till annat EU-land', kind: 'base_credit',
    accounts: ['3105','3106','3108'] },
  { code: '39', label: 'Försäljning av tjänster till annat EU-land', kind: 'base_credit',
    accounts: ['3308'] },
  { code: '41', label: 'Försäljning utanför EU (export)', kind: 'base_credit',
    accounts: ['3305','3306'] },

  { code: '10', label: 'Utgående moms 25%', kind: 'output_vat',
    accounts: ['2610','2611','2612','2613','2616','2617','2618','2619'] },
  { code: '11', label: 'Utgående moms 12%', kind: 'output_vat',
    accounts: ['2620','2621','2622','2623','2626','2627','2628','2629'] },
  { code: '12', label: 'Utgående moms 6%', kind: 'output_vat',
    accounts: ['2630','2631','2632','2633','2636','2637','2638','2639'] },

  { code: '30', label: 'Utgående moms 25% på EU-förvärv / omvänd skattskyldighet',
    kind: 'output_vat', accounts: ['2614','2615'] },
  { code: '31', label: 'Utgående moms 12% på EU-förvärv / omvänd skattskyldighet',
    kind: 'output_vat', accounts: ['2624','2625'] },
  { code: '32', label: 'Utgående moms 6% på EU-förvärv / omvänd skattskyldighet',
    kind: 'output_vat', accounts: ['2634','2635'] },

  { code: '48', label: 'Ingående moms att dra av', kind: 'input_vat',
    accounts: ['2640','2641','2642','2643','2644','2645','2646','2647','2648','2649'] },

  { code: '49', label: 'Moms att betala (+) / få tillbaka (−)', kind: 'computed',
    formula: { '10': 1, '11': 1, '12': 1, '30': 1, '31': 1, '32': 1, '48': -1 } },
];

// ─── Period resolution ──────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0'); }
function lastDayOfMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

export function resolvePeriod(input: any): { from: string; to: string } {
  if (input?.from && input?.to) return { from: input.from, to: input.to };
  const y = Number(input?.year);
  if (!y || !Number.isFinite(y)) throw new Error("Provide {from,to} or {year,month|quarter}");
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

    // Collect every account code we might need
    const accountCodes = new Set<string>();
    for (const b of BOXES_2026) {
      for (const a of b.accounts ?? []) accountCodes.add(a);
    }

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
        for (const a of b.accounts!) {
          const p = perAccount.get(a); if (!p) continue;
          sum += (p.credit - p.debit);
        }
        boxAmounts.set(b.code, sum);
      } else if (b.kind === 'input_vat') {
        let sum = 0;
        for (const a of b.accounts!) {
          const p = perAccount.get(a); if (!p) continue;
          sum += (p.debit - p.credit);
        }
        boxAmounts.set(b.code, sum);
      } else if (b.kind === 'base_credit') {
        let sum = 0;
        for (const a of b.accounts!) {
          const p = perAccount.get(a); if (!p) continue;
          sum += (p.credit - p.debit);
        }
        boxAmounts.set(b.code, sum);
      } else if (b.kind === 'base_debit') {
        let sum = 0;
        for (const a of b.accounts!) {
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

    return {
      form: 'SKV 4700',
      version: '2026',
      period: { from, to },
      boxes: boxOut,
      net_to_pay_cents: netToPay,
      direction: netToPay >= 0 ? 'pay_to_skatteverket' : 'refund_from_skatteverket',
      verification,
      note: 'Sums posted journal_entry_lines on BAS 2024 VAT accounts. Verify against 2650 control account before filing; then book the payment via manage_journal_entry (template "Momsredovisning (betalning)").',
    };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}
