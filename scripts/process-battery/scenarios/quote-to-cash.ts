import type { Scenario, ScenarioModule } from '../lib';

/**
 * Quote-to-Cash: a quote is drafted, sent, signed by the customer, becomes ONE
 * draft invoice, is issued, paid in a deposit and a rest, and partly credited.
 * Beside it: hours become an invoice, and an unpaid invoice is dunned.
 * The end state that must hold: the invoice bills exactly what was signed, the
 * receivable is booked when issued and settled with every payment, no more is
 * paid or credited than was billed, a credit carries its share of the VAT, and
 * a reminder that is logged "sent" was in fact handed to the mail rail.
 */
const FN_URL = (process.env.BATTERY_FN_URL ?? 'http://127.0.0.1:54321/functions/v1').replace(/\/$/, '');

/** The customer's hop: the public signing page posts here with the accept token — no login. */
async function signQuote(token: string, action: 'accept' | 'reject', email: string): Promise<{ status: number; body: Record<string, unknown> }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${FN_URL}/quote-sign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept_token: token, action, signer_name: 'Battery Kund', signer_email: email, signature_data: 'Battery Kund' }),
      signal: AbortSignal.timeout(90_000),
    });
    const text = await res.text();
    if ((res.status === 546 || res.status === 503 || /WORKER_LIMIT/.test(text)) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 200) }; }
    return { status: res.status, body };
  }
}

async function run(s: Scenario): Promise<void> {
  const email = `kund-${s.tag}@example.test`;
  const inThirtyDays = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // ── The quote ──────────────────────────────────────────────────────────────
  const created = await s.must('a quote is drafted: 10 × 1 000 kr + 25 % VAT, 40 % deposit', 'manage_quote', {
    action: 'create', customer_name: `Battery Kund ${s.tag}`, customer_email: email, title: `Battery offer ${s.tag}`,
    valid_until: inThirtyDays, prepayment_pct: 40,
    items: [{ description: 'Consulting day', quantity: 10, unit_price_cents: 100_000, tax_rate_pct: 25 }],
  });
  const quoteId = s.idOf(created, 'quote');
  const drafted = await quoteRow(s, quoteId);
  s.equal('a new quote is a draft', drafted?.status, 'draft');
  s.equal('the quote subtotal is 10 000 kr', drafted?.subtotal_cents, 1_000_000);
  s.equal('the quote VAT is 2 500 kr', drafted?.tax_cents, 250_000);
  s.equal('the quote total is 12 500 kr', drafted?.total_cents, 1_250_000);

  await s.must('a second line is added', 'manage_quote', { action: 'add_item', id: quoteId, description: 'Travel', quantity: 1, unit_price_cents: 40_000, tax_rate_pct: 25 });
  s.equal('adding a line recalculates the total', (await quoteRow(s, quoteId))?.total_cents, 1_300_000);
  await s.must('the lines are replaced with the original offer', 'manage_quote', {
    action: 'update', id: quoteId, items: [{ description: 'Consulting day', quantity: 10, unit_price_cents: 100_000, tax_rate_pct: 25 }],
  });
  s.equal('replacing the lines recalculates the total', (await quoteRow(s, quoteId))?.total_cents, 1_250_000);
  await s.mustRefuse('a line pointing at a product that does not exist is refused', 'manage_quote',
    { action: 'add_item', id: quoteId, product_id: '00000000-0000-4000-8000-000000000000', quantity: 1 }, /product|not found|resolve/i);

  // ── Approval above the threshold ───────────────────────────────────────────
  const big = await s.must('a 50 000 kr quote is drafted', 'manage_quote', {
    action: 'create', customer_name: `Battery Kund ${s.tag}`, customer_email: `approval-${s.tag}@example.test`, title: `Battery big offer ${s.tag}`, valid_until: inThirtyDays,
    items: [{ description: 'Platform build', quantity: 1, unit_price_cents: 4_000_000, tax_rate_pct: 25 }],
  });
  const bigId = s.idOf(big, 'quote');
  await s.must('approval is requested for it', 'manage_quote', { action: 'request_approval', id: bigId });
  const pending = await s.one<{ status: string; approval_request_id: string | null }>('select status, approval_request_id from quotes where id = $1', [bigId]);
  s.equal('the quote waits for approval', pending?.status, 'pending_approval');
  // FINDING 2026-09-19: the doc says request_approval "creates an approval_requests row and links
  // it". The skill only flips the status — no request exists, so nobody is ever asked.
  s.check('an approval request exists and is linked', pending?.approval_request_id != null, 'quotes.approval_request_id is null');
  // FINDING 2026-09-19: the doc says "sending is blocked while pending". send has no status check.
  await s.mustRefuse('a quote awaiting approval cannot be sent', 'manage_quote', { action: 'send', id: bigId }, /approv|pending/i);

  // The decision lands on the quote: approved → back to draft, ready to send.
  await s.asService(`select public.resolve_approval($1::uuid, 'approve', 'process battery: human approver')`, [String(pending?.approval_request_id)]);
  s.equal('an approved quote is a draft again, ready to send', (await quoteRow(s, bigId))?.status, 'draft');
  await s.must('the approved quote is sent', 'manage_quote', { action: 'send', id: bigId });
  s.equal('the approved quote is sent', (await quoteRow(s, bigId))?.status, 'sent');

  // ── A multi-step approval chain for quotes ─────────────────────────────────
  // A chain for 'quote' gates EVERY quote while it is active, so it lives only inside this block.
  await s.asService(`update approval_chains set is_active = false where entity_type = 'quote' and name like 'Battery quote chain %'`);
  const chain = await s.must('a two-step approval chain for quotes is set up', 'manage_approval_chain', {
    p_action: 'create_chain', p_name: `Battery quote chain ${s.tag}`, p_entity_type: 'quote',
    p_steps: [{ sort_order: 1, required_role: 'admin' }, { sort_order: 2, required_role: 'admin' }],
  });
  try {
    const chained = await s.must('a 30 000 kr quote is drafted under the chain', 'manage_quote', {
      action: 'create', customer_name: `Battery Kund ${s.tag}`, customer_email: `chain-${s.tag}@example.test`, title: `Battery chained offer ${s.tag}`, valid_until: inThirtyDays,
      items: [{ description: 'Workshop series', quantity: 1, unit_price_cents: 2_400_000, tax_rate_pct: 25 }],
    });
    const chainedId = s.idOf(chained, 'quote');
    await s.mustRefuse('under a chain a quote cannot be sent without approval', 'manage_quote', { action: 'send', id: chainedId }, /needs approval|approval chain/i);
    s.equal('the refused send left the quote a draft', (await quoteRow(s, chainedId))?.status, 'draft');
    const asked = await s.must('approval is requested — it enters the chain', 'manage_quote', { action: 'request_approval', id: chainedId });
    s.equal('the request is a chain request', asked.chain, true);
    s.equal('the chain has two steps', asked.chain_steps, 2);
    const askedAgain = await s.must('asking twice is the same request', 'manage_quote', { action: 'request_approval', id: chainedId });
    s.equal('one request per quote and amount', askedAgain.approval_request_id, asked.approval_request_id);
    const stepOne = await s.must('step one approves', 'advance_approval_step', { p_request_id: asked.approval_request_id, p_decision: 'approve' });
    s.equal('after step one the request is still pending', stepOne.status, 'pending');
    await s.mustRefuse('after one of two steps the quote still cannot be sent', 'manage_quote', { action: 'send', id: chainedId }, /pending approval/i);
    const stepTwo = await s.must('step two approves', 'advance_approval_step', { p_request_id: asked.approval_request_id, p_decision: 'approve' });
    s.equal('the last step approves the request', stepTwo.status, 'approved');
    s.equal('the chain decision lands on the quote', (await quoteRow(s, chainedId))?.status, 'draft');
    await s.must('the quote is raised to 60 000 kr after approval', 'manage_quote', {
      action: 'update', id: chainedId, items: [{ description: 'Workshop series, doubled', quantity: 2, unit_price_cents: 2_400_000, tax_rate_pct: 25 }],
    });
    await s.mustRefuse('an approval covers the amount it approved — the raised quote is not sent on it', 'manage_quote', { action: 'send', id: chainedId }, /needs approval/i);
    const reAsked = await s.must('the raised quote is put up for approval again', 'manage_quote', { action: 'request_approval', id: chainedId });
    s.check('the raise is a new request', reAsked.approval_request_id !== asked.approval_request_id, String(reAsked.approval_request_id));
    await s.must('the new request is rejected at step one', 'advance_approval_step', { p_request_id: reAsked.approval_request_id, p_decision: 'reject', p_comment: 'Too much for one customer' });
    s.equal('a rejected quote is a draft again, ready to rework', (await quoteRow(s, chainedId))?.status, 'draft');
    await s.must('the quote is reworked back to 30 000 kr', 'manage_quote', {
      action: 'update', id: chainedId, items: [{ description: 'Workshop series', quantity: 1, unit_price_cents: 2_400_000, tax_rate_pct: 25 }],
    });
    await s.must('the first approval covers it again — the quote is sent', 'manage_quote', { action: 'send', id: chainedId });
    s.equal('the chained quote is sent', (await quoteRow(s, chainedId))?.status, 'sent');
  } finally {
    await s.asService(`select public.manage_approval_chain('delete_chain', $1::uuid)`, [String(chain.chain_id)]);
  }
  s.equal('no quote chain outlives the scenario', (await s.one<{ n: string }>(`select count(*) as n from approval_chains where entity_type = 'quote' and is_active`))?.n, 0);

  // ── Send, sign, invoice ────────────────────────────────────────────────────
  const sent = await s.must('the quote is sent', 'manage_quote', { action: 'send', id: quoteId });
  const token = String(sent.accept_token ?? '');
  s.check('sending mints the public accept token', token.length >= 20, `token "${token}"`);
  const afterSend = await quoteRow(s, quoteId);
  s.equal('the quote is sent', afterSend?.status, 'sent');
  s.check('sent_at is stamped', afterSend?.sent_at != null);
  // FINDING 2026-09-19: the doc says sending "emails the customer". The skill's send mints the
  // token and flips the status; nothing is handed to the mail rail (outbound_communications),
  // so an agent-sent quote reaches nobody unless the agent mails the link itself.
  s.equal('sending hands the customer an email with the link', await mailsTo(s, email), 1);

  const accepted = await signQuote(token, 'accept', email);
  s.check('the customer signs yes on the public page', accepted.status === 200, `HTTP ${accepted.status}: ${JSON.stringify(accepted.body).slice(0, 200)}`);
  const signedQuote = await quoteRow(s, quoteId);
  s.equal('the quote is accepted', signedQuote?.status, 'accepted');
  const signature = await s.one<{ n: string; hashed: string }>(
    `select count(*) as n, count(content_hash) as hashed from quote_signatures where quote_id = $1`, [quoteId]);
  s.equal('one signature is stored', signature?.n, 1);
  s.equal('the signature carries a content hash', signature?.hashed, 1);
  s.check('acceptance created and linked an invoice', signedQuote?.invoice_id != null);
  const invoiceId = String(signedQuote?.invoice_id);
  const inv = await invoiceRow(s, invoiceId);
  s.equal('the invoice is born a draft', inv?.status, 'draft');
  s.equal('the invoice bills exactly what was signed', inv?.total_cents, 1_250_000);
  s.equal('the invoice carries the signed VAT', inv?.tax_cents, 250_000);

  s.check('acceptance mails the customer a receipt', (await mailsTo(s, email)) >= 1, 'nothing in outbound_communications');

  const twice = await signQuote(token, 'accept', email);
  s.check('signing a second time is refused', twice.status === 409, `HTTP ${twice.status}`);
  await s.must('convert_to_invoice is called on the accepted quote', 'manage_quote', { action: 'convert_to_invoice', id: quoteId });
  s.equal('one quote, one invoice', (await s.one<{ n: string }>(
    `select count(*) as n from invoices where customer_email = $1 and total_cents = 1250000`, [email]))?.n, 1);

  // ── Rejected and expired quotes ────────────────────────────────────────────
  const declined = await s.must('a second quote is drafted and sent', 'manage_quote', {
    action: 'create', customer_name: `Battery Kund ${s.tag}`, customer_email: email, title: `Battery declined ${s.tag}`, valid_until: inThirtyDays,
    items: [{ description: 'Workshop', quantity: 1, unit_price_cents: 80_000, tax_rate_pct: 25 }],
  });
  const declinedId = s.idOf(declined, 'quote');
  const declinedSent = await s.must('the second quote is sent', 'manage_quote', { action: 'send', id: declinedId });
  const no = await signQuote(String(declinedSent.accept_token), 'reject', email);
  s.check('the customer signs no', no.status === 200, `HTTP ${no.status}: ${JSON.stringify(no.body).slice(0, 200)}`);
  s.equal('the quote is rejected', (await quoteRow(s, declinedId))?.status, 'rejected');
  await s.mustRefuse('a rejected quote cannot become an order', 'manage_quote', { action: 'convert_to_order', id: declinedId }, /reject/i);
  // FINDING 2026-09-19: convert_to_invoice has no status check — a quote the customer DECLINED
  // becomes an invoice and is flipped to 'accepted', overwriting the customer's signed no.
  await s.mustRefuse('a rejected quote cannot become an invoice', 'manage_quote', { action: 'convert_to_invoice', id: declinedId }, /reject|accept/i);
  s.equal('a rejected quote stays rejected', (await quoteRow(s, declinedId))?.status, 'rejected');

  const stale = await s.must('a quote valid until yesterday is drafted', 'manage_quote', {
    action: 'create', customer_name: `Battery Kund ${s.tag}`, customer_email: email, title: `Battery stale ${s.tag}`, valid_until: yesterday,
    items: [{ description: 'Old offer', quantity: 1, unit_price_cents: 10_000, tax_rate_pct: 25 }],
  });
  const staleSent = await s.must('the stale quote is sent', 'manage_quote', { action: 'send', id: s.idOf(stale, 'quote') });
  const late = await signQuote(String(staleSent.accept_token), 'accept', email);
  s.check('signing after valid_until is refused with 410', late.status === 410 && late.body.code === 'quote_expired', `HTTP ${late.status}: ${JSON.stringify(late.body).slice(0, 200)}`);

  // ── Issue, deposit, rest ───────────────────────────────────────────────────
  await s.must('the invoice is issued', 'manage_invoice', { action: 'send', invoice_id: invoiceId });
  const issued = await invoiceRow(s, invoiceId);
  s.equal('the invoice is sent', issued?.status, 'sent');
  s.check('sent_at is stamped on the invoice', issued?.sent_at != null);
  await s.booksBalance('the issued invoice reaches the books, balanced', `e.invoice_id = $1 and e.source = 'invoice_issued'`, [invoiceId]);
  const receivable = await ledger(s, invoiceId, 'invoice_issued');
  s.equal('the receivable is the invoice total', receivable.ar, 1_250_000);
  s.equal('revenue is the net', -receivable.revenue, 1_000_000);
  s.equal('output VAT is booked', -receivable.vat, 250_000);

  // FINDING 2026-09-19: manage_invoice update rewrites line_items and totals of an ISSUED, booked
  // invoice — the invoice then states another amount than the receivable in the ledger.
  await s.mustRefuse('the lines of an issued invoice cannot be rewritten', 'manage_invoice', {
    action: 'update', invoice_id: invoiceId, line_items: [{ description: 'Consulting day', qty: 1, unit_price_cents: 100 }],
  }, /issued|sent|locked|draft|credit/i);
  const stillBilled = (await invoiceRow(s, invoiceId))?.total_cents;
  s.equal('an issued invoice keeps its total', stillBilled, 1_250_000);
  if (Number(stillBilled) !== 1_250_000) {
    // Put the signed lines back so the rest of the money trail is measured against the real invoice.
    await s.skill('manage_invoice', { action: 'update', invoice_id: invoiceId, tax_rate: 0.25, line_items: [{ description: 'Consulting day', qty: 10, unit_price_cents: 100_000 }] });
  }

  const deposit = await s.must('the 40 % deposit is paid', 'record_invoice_payment',
    { p_invoice_id: invoiceId, p_amount_cents: 500_000, p_method: 'card', p_reference: `dep-${s.tag}` });
  s.equal('the deposit leaves 7 500 kr open', deposit.remaining_cents, 750_000);
  s.equal('a deposit leaves the invoice partially paid', (await invoiceRow(s, invoiceId))?.status, 'partially_paid');
  await s.must('the same deposit is reported a second time (webhook retry)', 'record_invoice_payment',
    { p_invoice_id: invoiceId, p_amount_cents: 500_000, p_method: 'card', p_reference: `dep-${s.tag}` });
  s.equal('a repeated reference is counted once', (await invoiceRow(s, invoiceId))?.paid_amount_cents, 500_000);
  // FINDING 2026-09-19: a payment is booked only when the invoice flips to 'paid'
  // (on_invoice_status_book → book_invoice_paid). A deposit sits in the bank and not in the books.
  s.equal('the deposit is in the books the day it arrives', (await ledger(s, invoiceId, 'invoice_payment')).bank, 500_000);

  await s.mustRefuse('paying more than what remains is refused', 'record_invoice_payment',
    { p_invoice_id: invoiceId, p_amount_cents: 750_001, p_method: 'manual', p_reference: `over-${s.tag}` }, /exceeds/i);
  // FINDING 2026-09-19: two overloads of record_invoice_payment are live (4 args, and 5 with
  // p_reference). A call WITHOUT the optional p_reference is ambiguous to PostgREST (PGRST203)
  // and fails — the skill only works when the "optional" idempotency key is passed.
  const bare = await s.skill('record_invoice_payment', { p_invoice_id: invoiceId, p_amount_cents: 100, p_method: 'manual' });
  s.check('a payment without the optional reference is accepted', bare.ok, bare.error.slice(0, 160));
  const restCents = bare.ok ? 749_900 : 750_000;
  const rest = await s.must('the rest is paid', 'record_invoice_payment',
    { p_invoice_id: invoiceId, p_amount_cents: restCents, p_method: 'manual', p_reference: `rest-${s.tag}` });
  s.equal('the last payment settles the invoice', rest.fully_paid, true);
  const paid = await invoiceRow(s, invoiceId);
  s.equal('the invoice is paid', paid?.status, 'paid');
  s.check('paid_at is stamped', paid?.paid_at != null);
  s.equal('the running total equals the invoice', paid?.paid_amount_cents, 1_250_000);
  await s.booksBalance('the payment reaches the books, balanced', `e.invoice_id = $1 and e.source = 'invoice_payment'`, [invoiceId]);
  const settled = await ledger(s, invoiceId, null);
  s.equal('the bank received the whole invoice', settled.bank, 1_250_000);
  s.equal('the receivable is settled to zero', settled.ar, 0);
  await s.mustRefuse('a paid invoice takes no more money', 'record_invoice_payment',
    { p_invoice_id: invoiceId, p_amount_cents: 100, p_method: 'manual', p_reference: `extra-${s.tag}` }, /exceeds/i);
  await s.mustRefuse('an invoice with payments on it cannot be cancelled', 'manage_invoice',
    { action: 'cancel', invoice_id: invoiceId, reason: 'battery' }, /already paid|credit/i);

  // ── Credit notes ───────────────────────────────────────────────────────────
  const number = String(paid?.invoice_number);
  const cn1 = await s.must('a partial credit of 2 500 kr is issued', 'create_credit_note',
    { p_invoice_id: invoiceId, p_amount_cents: 250_000, p_reason: 'one day not delivered' });
  const cn1Id = s.idOf(cn1, 'credit_note');
  const credit = await invoiceRow(s, cn1Id);
  s.equal('the credit note is numbered after its invoice', credit?.invoice_number, `${number}-CN1`);
  s.equal('the credit note is born sent', credit?.status, 'sent');
  s.equal('the credit note is negative', credit?.total_cents, -250_000);
  s.equal('a partial credit carries its share of the VAT', credit?.tax_cents, -50_000);
  await s.booksBalance('the credit note reaches the books, balanced', `e.invoice_id = $1 and e.source = 'credit_note_issued'`, [cn1Id]);
  const reversed = await ledger(s, cn1Id, 'credit_note_issued');
  s.equal('the credit reverses revenue net of VAT', reversed.revenue, 200_000);
  s.equal('the credit reverses its VAT', reversed.vat, 50_000);
  await s.mustRefuse('a credit note cannot be paid', 'record_invoice_payment', { p_invoice_id: cn1Id, p_amount_cents: 100, p_reference: `cn-${s.tag}` }, /credit note/i);
  await s.mustRefuse('a credit note cannot be credited', 'create_credit_note', { p_invoice_id: cn1Id }, /credit/i);
  await s.mustRefuse('crediting more than what is left of the invoice is refused', 'create_credit_note',
    { p_invoice_id: invoiceId, p_amount_cents: 1_000_001 }, /exceed|more than|remain/i);
  const cn2 = await s.must('the rest of the invoice is credited', 'create_credit_note', { p_invoice_id: invoiceId, p_amount_cents: 1_000_000, p_reason: 'project cancelled' });
  s.equal('the last credit takes whatever VAT remains', (await invoiceRow(s, s.idOf(cn2, 'credit_note')))?.tax_cents, -200_000);
  await s.mustRefuse('a fully credited invoice cannot be credited again', 'create_credit_note', { p_invoice_id: invoiceId, p_amount_cents: 100 }, /exceed|more than|remain|fully/i);

  // ── Hours become an invoice ────────────────────────────────────────────────
  // The project's customer is a PARTY (projects.partner_id) — that is what the hours invoice reads
  // since 20260919150000. The customer the quotes went to is already in the register: find them.
  // A quote's customer is an address, not yet a party — the register takes a lead, and the lead gets its partner.
  const asLead = await s.must('the customer is a lead', 'add_lead', { email, name: `Battery Kund ${s.tag}`, source: 'manual' });
  const ensured = await s.must('…and the lead gets its party', 'ensure_lead_partner', { p_lead_id: s.idOf(asLead, 'lead') });
  const partnerId = String(ensured.partner_id ?? (await s.one<{ id: string }>('select partner_id as id from leads where id = $1', [s.idOf(asLead, 'lead')]))?.id ?? '');
  s.check('…with an id to put on the project', /^[0-9a-f-]{36}$/.test(partnerId), JSON.stringify(ensured).slice(0, 300));
  const project = await s.must('a billable project at 1 200 kr/h exists', 'manage_project', {
    action: 'create', name: `Battery project ${s.tag}`, client_name: `Battery Kund ${s.tag}`, partner_id: partnerId, hourly_rate_cents: 120_000, is_billable: true, budget_hours: 40,
  });
  const projectId = s.idOf(project, 'project');
  await s.must('a task is defined', 'manage_project_task', { action: 'create', project_id: projectId, title: `Battery task ${s.tag}` });
  const today = new Date().toISOString().slice(0, 10);
  const consultant = await s.must('a consultant is on the payroll', 'manage_employee', { action: 'create', name: `Battery Konsult ${s.tag}`, email: `konsult-${s.tag}@example.test` });
  const employeeId = s.idOf(consultant, 'employee');
  await s.must('five billable hours are logged', 'log_time', { action: 'create', project_id: projectId, entry_date: today, hours: 5, description: 'Workshop', is_billable: true, employee_id: employeeId });
  await s.must('three billable hours are logged', 'log_time', { action: 'create', project_id: projectId, entry_date: today, hours: 3, description: 'Follow-up', is_billable: true, employee_id: employeeId });
  await s.must('two internal hours are logged', 'log_time', { action: 'create', project_id: projectId, entry_date: today, hours: 2, description: 'Internal', is_billable: false, employee_id: employeeId });
  const hours = await s.must('the hours are invoiced', 'invoice_from_timesheets', { project_id: projectId, period: 'custom', start_date: today, end_date: today });
  const hoursInvoiceId = String(((hours.invoices ?? []) as Array<{ invoice_id: string }>)[0]?.invoice_id ?? '');
  const hoursInvoice = await invoiceRow(s, hoursInvoiceId);
  s.equal('eight billable hours at 1 200 kr are billed', hoursInvoice?.subtotal_cents, 960_000);
  s.equal('the hours invoice totals 12 000 kr incl. VAT', hoursInvoice?.total_cents, 1_200_000);
  s.equal('the hours invoice is a draft', hoursInvoice?.status, 'draft');
  const entries = await s.one<{ invoiced: string; open: string }>(
    `select count(*) filter (where is_invoiced) as invoiced, count(*) filter (where not is_invoiced) as open from time_entries where project_id = $1`, [projectId]);
  s.equal('the two billable entries are marked invoiced', entries?.invoiced, 2);
  s.equal('the internal entry is left alone', entries?.open, 1);
  await s.mustRefuse('the same hours cannot be invoiced twice', 'invoice_from_timesheets',
    { project_id: projectId, period: 'custom', start_date: today, end_date: today }, /no billable|uninvoiced/i);
  s.check('the hours invoice knows who the customer is',
    hoursInvoice?.partner_id === partnerId && hoursInvoice?.customer_email === email,
    `partner_id ${hoursInvoice?.partner_id} (project's ${partnerId}), customer_email ${hoursInvoice?.customer_email}`);

  const reduced = await s.must('a second project exists', 'manage_project', {
    action: 'create', name: `Battery course ${s.tag}`, client_name: `Battery Kund ${s.tag}`, hourly_rate_cents: 100_000, is_billable: true,
  });
  const reducedId = s.idOf(reduced, 'project');
  await s.must('one hour is logged on it', 'log_time', { action: 'create', project_id: reducedId, entry_date: today, hours: 1, description: 'Course', is_billable: true, employee_id: employeeId });
  const reducedRun = await s.must('it is invoiced at 6 % VAT', 'invoice_from_timesheets',
    { project_id: reducedId, period: 'custom', start_date: today, end_date: today, tax_rate: 0.06 });
  // FINDING 2026-09-19: invoice_from_timesheets declares tax_rate; the handler never passes it and
  // bulk_invoice_from_timesheets hardcodes v_tax_rate := 0.25.
  s.equal('the tax_rate the skill accepts is the one applied', (await invoiceRow(s,
    String(((reducedRun.invoices ?? []) as Array<{ invoice_id: string }>)[0]?.invoice_id ?? '')))?.tax_cents, 6_000);

  // ── Overdue and dunning ────────────────────────────────────────────────────
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const late1 = await s.must('an invoice due ten days ago exists', 'manage_invoice', {
    action: 'create', customer_name: `Battery Sen ${s.tag}`, customer_email: `sen-${s.tag}@example.test`, due_date: tenDaysAgo,
    line_items: [{ description: 'Retainer', qty: 1, unit_price_cents: 200_000 }], tax_rate: 0.25,
  });
  const lateId = s.idOf(late1, 'invoice');
  s.equal('the invoice totals 2 500 kr', (await invoiceRow(s, lateId))?.total_cents, 250_000);
  await s.must('the late invoice is issued', 'manage_invoice', { action: 'send', invoice_id: lateId });
  const draftLate = await s.must('a DRAFT due ten days ago exists too', 'manage_invoice', {
    action: 'create', customer_name: `Battery Utkast ${s.tag}`, due_date: tenDaysAgo, line_items: [{ description: 'Never issued', qty: 1, unit_price_cents: 100_000 }],
  });
  const overdue = await s.must('the overdue check runs', 'invoice_overdue_check', {});
  const flaggedIds = ((overdue.invoices ?? []) as Array<{ id: string }>).map((r) => r.id);
  s.check('the issued, unpaid, past-due invoice is reported', flaggedIds.includes(lateId));
  s.check('a draft is never overdue', !flaggedIds.includes(s.idOf(draftLate, 'invoice')));
  s.equal('the invoice is flagged overdue', (await invoiceRow(s, lateId))?.status, 'overdue');

  await s.must('the dunning sweep runs', 'send_dunning_reminders', {});
  await s.must('the dunning sweep runs a second time the same day', 'send_dunning_reminders', {});
  const reminders = await s.sql<{ step_name: string; status: string; recipient_email: string }>(
    'select step_name, status, recipient_email from invoice_dunning_actions where invoice_id = $1', [lateId]);
  s.equal('one reminder per invoice per step per day', reminders.length, 1);
  s.equal('ten days overdue is the friendly reminder', reminders[0]?.step_name, 'friendly_reminder');
  // FINDING 2026-09-19: send_dunning_reminders writes action_type 'email', status 'sent' and
  // dispatches nothing — no outbound_communications row, no event, and no code anywhere reads
  // invoice_dunning_actions. "Sent" is a label; the customer is never reminded.
  s.check('a reminder logged as sent was handed to the mail rail', (await mailsTo(s, `sen-${s.tag}@example.test`)) > 0 || reminders[0]?.status !== 'sent',
    `invoice_dunning_actions.status = '${reminders[0]?.status}', and nothing to the customer in outbound_communications`);

  // FINDING 2026-09-19: cancelling an issued invoice leaves its invoice_issued entry standing —
  // receivable, revenue and output VAT for an invoice that no longer exists.
  await s.must('the unpaid overdue invoice is cancelled', 'manage_invoice', { action: 'cancel', invoice_id: lateId, reason: 'battery: customer gone' });
  s.equal('a cancelled invoice leaves no receivable in the books', (await ledger(s, lateId, null)).ar, 0);
  await s.mustRefuse('a cancelled invoice takes no payment', 'record_invoice_payment', { p_invoice_id: lateId, p_amount_cents: 100, p_reference: `gone-${s.tag}` }, /cancelled/i);

  s.skip('Pay now through Stripe Checkout', 'needs Stripe — payments are recorded through record_invoice_payment, the RPC the webhook calls');
  s.skip('bank-file reconciliation matches the payment', 'covered by record-to-report');
}

/** What the mail rail holds for a recipient (locally the provider is simulated, the row is real). */
async function mailsTo(s: Scenario, recipient: string): Promise<number> {
  return Number((await s.one<{ n: string }>(`select count(*) as n from outbound_communications where channel = 'email' and recipient = $1`, [recipient]))?.n ?? 0);
}

interface QuoteRow { status: string; subtotal_cents: number; tax_cents: number; total_cents: number; sent_at: Date | null; invoice_id: string | null }
async function quoteRow(s: Scenario, id: string): Promise<QuoteRow | undefined> {
  return s.one<QuoteRow>('select status, subtotal_cents, tax_cents, total_cents, sent_at, invoice_id from quotes where id = $1', [id]);
}

interface InvoiceRow {
  status: string; invoice_number: string; subtotal_cents: number; tax_cents: number; total_cents: number; paid_amount_cents: string;
  sent_at: Date | null; paid_at: Date | null; customer_email: string | null; partner_id: string | null; company_id: string | null;
}
async function invoiceRow(s: Scenario, id: string): Promise<InvoiceRow | undefined> {
  if (!id) return undefined;
  return s.one<InvoiceRow>(
    `select status::text, invoice_number, subtotal_cents, tax_cents, total_cents, coalesce(paid_amount_cents, 0) as paid_amount_cents,
            sent_at, paid_at, customer_email, partner_id, company_id from invoices where id = $1`, [id]);
}

/** Net movement (debit − credit) per role over the entries of one invoice; `source` null = all of them. */
async function ledger(s: Scenario, invoiceId: string, source: string | null): Promise<{ ar: number; revenue: number; vat: number; bank: number }> {
  const row = await s.one<{ ar: string; revenue: string; vat: string; bank: string }>(
    `select coalesce(sum(l.debit_cents - l.credit_cents) filter (where l.account_code = public.account_for('accounts_receivable')), 0) as ar,
            coalesce(sum(l.debit_cents - l.credit_cents) filter (where l.account_code = public.account_for('sales_revenue')), 0) as revenue,
            coalesce(sum(l.debit_cents - l.credit_cents) filter (where l.account_code = public.account_for('vat_output')), 0) as vat,
            coalesce(sum(l.debit_cents - l.credit_cents) filter (where l.account_code = public.account_for('bank')), 0) as bank
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.invoice_id = $1 and ($2::text is null or e.source = $2)`, [invoiceId, source]);
  return { ar: Number(row?.ar ?? 0), revenue: Number(row?.revenue ?? 0), vat: Number(row?.vat ?? 0), bank: Number(row?.bank ?? 0) };
}

export default { process: 'quote-to-cash', run } satisfies ScenarioModule;
