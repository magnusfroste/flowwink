import type { Scenario, ScenarioModule } from '../lib';

/**
 * Subscribe-to-Renew: an invoice-billed subscription is created, billed on its
 * cycle, changed mid-cycle, chased, cancelled and its churn explained.
 * The end state that must hold: one invoice per period and never two, the
 * cycle invoice is quantity × price + VAT, a mid-cycle change costs the
 * REMAINING share of the period that was billed (never the period twice), a
 * downgrade credit the platform records is a credit the next invoice honours,
 * and a cancelled subscription bills nothing more.
 */
const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function run(s: Scenario): Promise<void> {
  const email = `abo-${s.tag}@example.test`;
  const today = isoDay(new Date());
  const mrrBefore = await mrr(s);

  // ── Create and bill the first cycle ────────────────────────────────────────
  const created = await s.must('a monthly plan is signed: 2 seats × 500 kr', 'create_manual_subscription', {
    customer_email: email, customer_name: `Battery Abo ${s.tag}`, product_name: `Battery plan ${s.tag}`,
    unit_amount_cents: 50_000, quantity: 2, billing_interval: 'month', payment_terms: 'invoice_30', start_date: today,
  });
  const subId = s.idOf(created, 'subscription');
  const born = await subRow(s, subId);
  s.equal('the subscription is active', born?.status, 'active');
  s.equal('it is a manual (invoice-billed) subscription', born?.provider, 'manual');
  s.equal('the first invoice is due on the start date', born?.next_invoice_date, today);
  s.equal('MRR grows by 1 000 kr', (await mrr(s)) - mrrBefore, 100_000);

  const first = await s.must('the first cycle is billed', 'generate_subscription_invoice', { subscription_id: subId });
  const firstId = s.idOf(first, 'invoice');
  const inv = await invoiceRow(s, firstId);
  s.check('the cycle invoice is numbered SUB-…', /^SUB-\d{8}-\d{5}$/.test(String(inv?.invoice_number)), `got "${inv?.invoice_number}"`);
  s.equal('a cycle invoice is a draft for review', inv?.status, 'draft');
  s.equal('the cycle invoice is 2 × 500 kr net', inv?.subtotal_cents, 100_000);
  s.equal('plus 25 % VAT', inv?.tax_cents, 25_000);
  s.equal('the cycle invoice totals 1 250 kr', inv?.total_cents, 125_000);
  s.equal('the invoice points back at the subscription', inv?.subscription_id, subId);
  const rolled = await subRow(s, subId);
  s.equal('the next invoice date is the old period end', rolled?.next_invoice_date, born?.period_end);
  s.equal('the new period starts where the old one ended', rolled?.period_start, born?.period_end);

  await s.mustRefuse('the same period cannot be billed twice', 'generate_subscription_invoice', { subscription_id: subId }, /not due/i);
  await s.must('the daily billing run passes', 'run_subscription_billing', {});
  s.equal('the billing run does not bill the period again', await invoiceCount(s, subId), 1);

  // ── Collect ────────────────────────────────────────────────────────────────
  await s.must('the cycle invoice is issued', 'manage_invoice', { action: 'send', invoice_id: firstId });
  await s.booksBalance('the cycle invoice reaches the books, balanced', `e.invoice_id = $1 and e.source = 'invoice_issued'`, [firstId]);
  await s.must('the customer pays it', 'record_invoice_payment', { p_invoice_id: firstId, p_amount_cents: 125_000, p_method: 'manual', p_reference: `sub-${s.tag}` });
  s.equal('the cycle invoice is paid', (await invoiceRow(s, firstId))?.status, 'paid');
  const settled = await s.one<{ ar: string; bank: string; revenue: string }>(
    `select coalesce(sum(l.debit_cents - l.credit_cents) filter (where l.account_code = public.account_for('accounts_receivable')), 0) as ar,
            coalesce(sum(l.debit_cents - l.credit_cents) filter (where l.account_code = public.account_for('bank')), 0) as bank,
            coalesce(sum(l.credit_cents - l.debit_cents) filter (where l.account_code = public.account_for('sales_revenue')), 0) as revenue
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id where e.invoice_id = $1`, [firstId]);
  s.equal('the receivable is settled', settled?.ar, 0);
  s.equal('the bank holds the payment', settled?.bank, 125_000);
  s.equal('recurring revenue is booked net of VAT', settled?.revenue, 100_000);

  // ── Auto-finalize + dunning on the invoice ─────────────────────────────────
  const auto = await s.must('an auto-finalizing subscription is signed', 'create_manual_subscription', {
    customer_email: `auto-${s.tag}@example.test`, customer_name: `Battery Auto ${s.tag}`, product_name: `Battery auto plan ${s.tag}`,
    unit_amount_cents: 80_000, quantity: 1, auto_finalize: true, start_date: today,
  });
  const autoInvoice = await s.must('its first cycle is billed, already ten days past due', 'generate_subscription_invoice',
    { subscription_id: s.idOf(auto, 'subscription'), due_in_days: -10 });
  const autoInvoiceId = s.idOf(autoInvoice, 'invoice');
  const issued = await invoiceRow(s, autoInvoiceId);
  s.equal('an auto-finalized cycle invoice is born sent', issued?.status, 'sent');
  s.check('sent_at is stamped', issued?.sent_at != null);
  await s.booksBalance('an invoice born sent is booked at birth', `e.invoice_id = $1 and e.source = 'invoice_issued'`, [autoInvoiceId]);
  await s.must('the dunning sweep runs', 'send_dunning_reminders', {});
  s.equal('the unpaid cycle invoice is overdue', (await invoiceRow(s, autoInvoiceId))?.status, 'overdue');
  const reminder = await s.one<{ step_name: string; status: string }>('select step_name, status from invoice_dunning_actions where invoice_id = $1', [autoInvoiceId]);
  s.equal('ten days overdue is the friendly reminder', reminder?.step_name, 'friendly_reminder');
  // FINDING 2026-09-19 (same root as quote-to-cash): the reminder row says email/sent; nothing is
  // handed to the mail rail and no code reads invoice_dunning_actions.
  const mailed = await s.one<{ n: string }>(`select count(*) as n from outbound_communications where recipient = $1`, [`auto-${s.tag}@example.test`]);
  s.check('a reminder logged as sent reached the mail rail', Number(mailed?.n ?? 0) > 0 || reminder?.status !== 'sent',
    `invoice_dunning_actions.status = '${reminder?.status}', outbound_communications has nothing for the customer`);
  await s.must('the at-risk sweep runs', 'flag_at_risk_subscriptions', {});

  // ── Upgrade in the middle of a BILLED period ───────────────────────────────
  const midStart = new Date(Date.now() - 15 * DAY);
  const mid = await s.must('a subscription that started 15 days ago: 1 seat × 1 000 kr', 'create_manual_subscription', {
    customer_email: `mid-${s.tag}@example.test`, customer_name: `Battery Mid ${s.tag}`, product_name: `Battery mid plan ${s.tag}`,
    unit_amount_cents: 100_000, quantity: 1, start_date: isoDay(midStart),
  });
  const midId = s.idOf(mid, 'subscription');
  const midBorn = await subRow(s, midId);
  await s.must('its running period is billed', 'generate_subscription_invoice', { subscription_id: midId });
  const periodEnd = new Date(`${midBorn?.period_end}T00:00:00Z`).getTime();
  const periodStart = new Date(`${midBorn?.period_start}T00:00:00Z`).getTime();
  const remaining = Math.max(0, periodEnd - Date.now()) / (periodEnd - periodStart);
  await s.mustRefuse('zero seats is refused — cancel instead', 'change_subscription', { p_subscription_id: midId, p_new_quantity: 0 }, /quantity must be/i);
  const upgrade = await s.must('two seats are added mid-period', 'change_subscription', { p_subscription_id: midId, p_new_quantity: 3 });
  s.equal('the change is 2 000 kr per period', Number(upgrade.new_per_period_cents) - Number(upgrade.old_per_period_cents), 200_000);
  // FINDING 2026-09-19: generate_subscription_invoice moves current_period_* to the NEXT,
  // unbilled period. change_subscription prorates against that pointer, so "remaining" is
  // always ≥ 100 % — half-way through the billed month two extra seats cost 2 000 kr, not ~1 000.
  const expected = Math.round(200_000 * remaining);
  // The check NAME is the ratchet key in known-red.json — it must not carry a number that moves with the clock.
  s.check('the upgrade costs the remaining share of the billed period',
    Math.abs(Number(upgrade.prorated_cents) - expected) <= 4_000,
    `expected ~${expected} öre of 200 000; prorated_cents ${upgrade.prorated_cents}, remaining_fraction ${upgrade.remaining_fraction}; ${Math.round(remaining * 100)} % of the billed period is left`);
  const adjustment = await invoiceRow(s, String(upgrade.adjustment_invoice_id ?? ''));
  s.check('the adjustment invoice is numbered SUB-ADJ-…', /^SUB-ADJ-/.test(String(adjustment?.invoice_number)), `got "${adjustment?.invoice_number}"`);
  s.equal('the adjustment invoice is a draft', adjustment?.status, 'draft');
  s.equal('the adjustment bills the prorated amount', adjustment?.subtotal_cents, upgrade.prorated_cents);
  s.equal('the adjustment carries 25 % VAT', adjustment?.tax_cents, Math.round(Number(upgrade.prorated_cents) * 0.25));
  s.equal('the subscription now holds three seats', (await subRow(s, midId))?.quantity, 3);

  // ── Upgrade BEFORE the period is billed ────────────────────────────────────
  const early = await s.must('a subscription starts today: 1 seat × 1 000 kr', 'create_manual_subscription', {
    customer_email: `early-${s.tag}@example.test`, customer_name: `Battery Early ${s.tag}`, product_name: `Battery early plan ${s.tag}`,
    unit_amount_cents: 100_000, quantity: 1, start_date: today,
  });
  const earlyId = s.idOf(early, 'subscription');
  await s.must('two seats are added before the first invoice', 'change_subscription', { p_subscription_id: earlyId, p_new_quantity: 3 });
  await s.must('the first cycle is billed at three seats', 'generate_subscription_invoice', { subscription_id: earlyId });
  // FINDING 2026-09-19: the period was not billed yet, so nothing was owed for the change — the
  // cycle invoice already carries three seats. The adjustment bills the two new seats a second time.
  s.equal('one period at three seats costs 3 000 kr net, not more', (await s.one<{ cents: string }>(
    `select coalesce(sum(subtotal_cents), 0) as cents from invoices where subscription_id = $1 and status <> 'cancelled'`, [earlyId]))?.cents, 300_000);

  // ── Downgrade: the credit the platform records ─────────────────────────────
  // Billed in advance: the first invoice covers [start, start + 1 month). Ten days in, a seat is
  // removed — the unused share of THAT (billed) period is the credit. (An earlier version started
  // 45 days back, so the billed period was already over and the "credit" the old code handed out
  // was a share of a period nobody had been billed for.)
  const downStart = new Date(Date.now() - 10 * DAY);
  const down = await s.must('a subscription that started 10 days ago: 4 seats × 1 000 kr', 'create_manual_subscription', {
    customer_email: `down-${s.tag}@example.test`, customer_name: `Battery Down ${s.tag}`, product_name: `Battery down plan ${s.tag}`,
    unit_amount_cents: 100_000, quantity: 4, start_date: isoDay(downStart),
  });
  const downId = s.idOf(down, 'subscription');
  await s.must('its first period is billed', 'generate_subscription_invoice', { subscription_id: downId });
  const billed = await s.one<{ share: string }>(
    `select extract(epoch from (current_period_start - now())) / extract(epoch from (current_period_start - (current_period_start - interval '1 month'))) as share
       from subscriptions where id = $1`, [downId]);
  const expectedCredit = Math.round(100_000 * Number(billed?.share));
  const downgrade = await s.must('one seat is removed', 'change_subscription', { p_subscription_id: downId, p_new_quantity: 3 });
  const credit = Number(downgrade.credit_cents ?? 0);
  s.check('a downgrade records a credit, not an invoice', credit > 0 && downgrade.adjustment_invoice_id == null, JSON.stringify(downgrade).slice(0, 300));
  s.check('the credit is the unused share of the BILLED period (one seat × ~2/3 of the month)',
    Math.abs(credit - expectedCredit) <= 500 && credit > 50_000 && credit < 80_000, `credit ${credit}, expected ~${expectedCredit}`);
  s.equal('the credit is kept on the subscription', Number((await s.one<{ c: string }>(
    `select metadata->>'pending_credit_cents' as c from subscriptions where id = $1`, [downId]))?.c ?? 0), credit);
  await s.mustRefuse('the next cycle is not due yet', 'generate_subscription_invoice', { subscription_id: downId }, /not due/i);
  // The test clock: a month passes. No skill moves time, so the period pointers are moved instead.
  await s.asService(`update subscriptions set current_period_start = current_period_start - interval '1 month',
      current_period_end = current_period_end - interval '1 month', next_invoice_date = (next_invoice_date - interval '1 month')::date where id = $1`, [downId]);
  const next = await s.must('the next cycle is billed', 'generate_subscription_invoice', { subscription_id: downId });
  s.equal('the next invoice honours the recorded credit', (await invoiceRow(s, s.idOf(next, 'invoice')))?.subtotal_cents, 300_000 - credit);
  s.equal('…and the credit is spent, once', Number((await s.one<{ c: string }>(
    `select metadata->>'pending_credit_cents' as c from subscriptions where id = $1`, [downId]))?.c ?? -1), 0);

  // ── Plans and commitment ───────────────────────────────────────────────────
  const plan = await s.must('a 12-month plan template exists', 'manage_subscription_plan', {
    action: 'create', name: `Battery annual ${s.tag}`, product_name: `Battery annual ${s.tag}`, unit_amount_cents: 70_000, billing_interval: 'month', commitment_months: 12,
  });
  const committed = await s.must('a subscription is created from the plan', 'create_manual_subscription', {
    customer_email: `plan-${s.tag}@example.test`, customer_name: `Battery Plan ${s.tag}`, plan_id: s.idOf(plan, 'plan'),
  });
  s.equal('the plan fills the price', committed.unit_amount_cents, 70_000);
  const committedId = s.idOf(committed, 'subscription');
  const early2 = await s.must('it is cancelled in month one', 'cancel_manual_subscription', { subscription_id: committedId, reason: 'battery: early exit' });
  s.equal('cancelling inside the commitment is flagged early termination', early2.early_termination, true);
  s.check('about twelve months of commitment remain', Number(early2.months_remaining) >= 12 && Number(early2.months_remaining) <= 13, `months_remaining ${early2.months_remaining}`);

  // ── Cancel, churn, win back ────────────────────────────────────────────────
  await s.must('the first subscription is cancelled', 'cancel_manual_subscription', { subscription_id: subId, reason: 'battery: too expensive' });
  const gone = await subRow(s, subId);
  s.equal('the subscription is canceled', gone?.status, 'canceled');
  s.check('canceled_at and ended_at are stamped', gone?.canceled_at != null && gone?.ended_at != null);
  s.equal('no further invoice date is set', gone?.next_invoice_date, null);
  await s.mustRefuse('a canceled subscription bills nothing more', 'generate_subscription_invoice', { subscription_id: subId }, /status canceled/i);
  await s.mustRefuse('a canceled subscription cannot be changed', 'change_subscription', { p_subscription_id: subId, p_new_quantity: 5 }, /status canceled/i);
  await s.must('the billing run passes again', 'run_subscription_billing', {});
  s.equal('the billing run leaves the canceled subscription alone', await invoiceCount(s, subId), 1);
  s.equal('MRR no longer counts the canceled seats', (await mrr(s)) - mrrBefore - 80_000 - 300_000 - 300_000 - 300_000, 0);

  await s.must('the churn reason is recorded', 'record_churn_reason', { p_subscription_id: subId, p_reason: 'too_expensive', p_nps_score: 6, p_would_return: true });
  await s.must('the churn reason is corrected', 'record_churn_reason', { p_subscription_id: subId, p_reason: 'missing_feature', p_feedback: 'needs SSO' });
  const churn = await s.sql<{ reason: string; nps_score: number }>('select reason::text, nps_score from subscription_churn_reasons where subscription_id = $1', [subId]);
  s.equal('one churn reason per subscription', churn.length, 1);
  s.equal('the correction replaced the reason', churn[0]?.reason, 'missing_feature');
  s.equal('the NPS survived the correction', churn[0]?.nps_score, 6);
  await s.mustRefuse('a churn reason outside the list is refused', 'record_churn_reason', { p_subscription_id: subId, p_reason: 'aliens' }, /invalid input value|enum|churn_reason/i);

  const campaign = await s.must('a win-back campaign is created', 'manage_winback_campaign', {
    action: 'create', name: `Battery winback ${s.tag}`, trigger_type: 'too_expensive', offer_type: 'discount', discount_percent: 20,
    discount_duration_months: 3, email_subject: 'Come back', email_body: '20 % off for three months', active: true,
  });
  s.check('the campaign is stored active', (await s.one<{ active: boolean }>(
    'select active from subscription_winback_campaigns where id = $1', [s.idOf(campaign, 'campaign')]))?.active === true);

  // ── Usage on top of the fixed fee ──────────────────────────────────────────
  const metered = await s.must('a metered plan is signed: 1 000 kr per month', 'create_manual_subscription', {
    customer_email: `usage-${s.tag}@example.test`, customer_name: `Battery Usage ${s.tag}`, product_name: `Battery API ${s.tag}`,
    unit_amount_cents: 100_000, quantity: 1, billing_interval: 'month', payment_terms: 'invoice_30', start_date: today,
  });
  const meteredId = s.idOf(metered, 'subscription');
  await s.mustRefuse('usage without a meter is refused — the price is never guessed', 'record_subscription_usage',
    { p_subscription_id: meteredId, p_metric: 'api_calls', p_quantity: 100 }, /no active meter/i);
  await s.mustRefuse('a new meter needs a price', 'manage_usage_meter', { p_subscription_id: meteredId, p_metric: 'api_calls' }, /never guessed/i);
  await s.must('a meter is defined: 0,50 kr per call, 1 000 included', 'manage_usage_meter', {
    p_subscription_id: meteredId, p_metric: 'api_calls', p_unit_amount_cents: 50, p_included_quantity: 1000, p_unit_label: 'calls',
  });
  const usageOne = await s.must('1 200 calls are reported', 'record_subscription_usage', { p_subscription_id: meteredId, p_metric: 'api_calls', p_quantity: 1200, p_idempotency_key: `week-1-${s.tag}` });
  const usageAgain = await s.must('the same report arrives again', 'record_subscription_usage', { p_subscription_id: meteredId, p_metric: 'api_calls', p_quantity: 1200, p_idempotency_key: `week-1-${s.tag}` });
  s.equal('the same key is the same record', usageAgain.usage_record_id, usageOne.usage_record_id);
  await s.must('300 more calls are reported', 'record_subscription_usage', { p_subscription_id: meteredId, p_metric: 'api_calls', p_quantity: 300, p_idempotency_key: `week-2-${s.tag}` });
  const summary = await s.must('the unbilled usage is readable', 'subscription_usage_summary', { p_subscription_id: meteredId });
  const meterRow = ((summary.meters as Array<Record<string, unknown>>) ?? [])[0] ?? {};
  s.equal('1 500 calls are unbilled', Number(meterRow.unbilled_quantity), 1500);
  s.equal('500 of them are beyond the included 1 000: 250 kr', Number(meterRow.unbilled_amount_cents), 25_000);
  const meteredInvoice = await s.must('the cycle is billed with its usage', 'generate_subscription_invoice', { subscription_id: meteredId });
  s.equal('the invoice answers the usage it carries', meteredInvoice.usage_cents, 25_000);
  const meteredRow = await s.one<{ subtotal_cents: number; lines: number }>(
    'select subtotal_cents, jsonb_array_length(line_items) as lines from invoices where id = $1', [s.idOf(meteredInvoice, 'invoice')]);
  s.equal('fixed fee + usage: 1 250 kr net', meteredRow?.subtotal_cents, 125_000);
  s.equal('the usage is its own invoice line', meteredRow?.lines, 2);
  s.equal('every counted record is stamped with the invoice', (await s.one<{ n: string }>(
    'select count(*) as n from subscription_usage_records where subscription_id = $1 and invoice_id = $2', [meteredId, s.idOf(meteredInvoice, 'invoice')]))?.n, 2);
  let billedEdited = true;
  try { await s.sql('update subscription_usage_records set quantity = 1 where id = $1', [String(usageOne.usage_record_id)]); } catch { billedEdited = false; }
  s.check('billed usage is final', !billedEdited);
  await s.must('usage after the invoice waits for the next one', 'record_subscription_usage', { p_subscription_id: meteredId, p_metric: 'api_calls', p_quantity: 40 });
  const after = await s.must('the summary is read again', 'subscription_usage_summary', { p_subscription_id: meteredId });
  s.equal('only the new usage is unbilled', Number(((after.meters as Array<Record<string, unknown>>) ?? [])[0]?.unbilled_quantity), 40);

  // ── Cohorts ────────────────────────────────────────────────────────────────
  const cohorts = await s.must('cohort retention is computed', 'subscription_cohort_retention', { p_months: 6 });
  const thisMonth = ((cohorts.cohorts as Array<{ cohort: string; started: number; retained: Array<{ month: number; active: number }> | null }>) ?? [])
    .find((c) => c.cohort === today.slice(0, 7));
  s.check('this month is a cohort with the subscriptions that started in it', Number(thisMonth?.started) >= 5, JSON.stringify(thisMonth).slice(0, 200));
  s.equal('month 0 counts everyone who started', thisMonth?.retained?.[0]?.active, thisMonth?.started);
  s.equal('months that have not happened are absent, not 100 %', thisMonth?.retained?.length, 1);

  s.skip('card subscriptions: Stripe checkout, payment_failed webhook, the day 0/3/7/10/14 dunning ladder', 'needs Stripe');
  s.skip('win-back emails reach churned customers', 'needs an email provider — and the doc says the send log has no writer yet');
}

interface SubRow {
  status: string; provider: string; quantity: number; next_invoice_date: string | null; period_start: string | null; period_end: string | null;
  canceled_at: Date | null; ended_at: Date | null;
}
async function subRow(s: Scenario, id: string): Promise<SubRow | undefined> {
  return s.one<SubRow>(
    `select status::text, provider, quantity, next_invoice_date::text, current_period_start::date::text as period_start,
            current_period_end::date::text as period_end, canceled_at, ended_at from subscriptions where id = $1`, [id]);
}

interface InvoiceRow { status: string; invoice_number: string; subtotal_cents: number; tax_cents: number; total_cents: number; subscription_id: string | null; sent_at: Date | null }
async function invoiceRow(s: Scenario, id: string): Promise<InvoiceRow | undefined> {
  if (!id) return undefined;
  return s.one<InvoiceRow>('select status::text, invoice_number, subtotal_cents, tax_cents, total_cents, subscription_id, sent_at from invoices where id = $1', [id]);
}

async function invoiceCount(s: Scenario, subscriptionId: string): Promise<number> {
  return Number((await s.one<{ n: string }>('select count(*) as n from invoices where subscription_id = $1', [subscriptionId]))?.n ?? 0);
}

async function mrr(s: Scenario): Promise<number> {
  const out = await s.skill<{ data?: { mrr_cents?: number }; mrr_cents?: number }>('subscription_mrr', {});
  return Number(out.data.data?.mrr_cents ?? out.data.mrr_cents ?? 0);
}

export default { process: 'subscribe-to-renew', run } satisfies ScenarioModule;
