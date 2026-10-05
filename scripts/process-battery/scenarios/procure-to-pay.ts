import { randomUUID } from 'node:crypto';
import type { Scenario, ScenarioModule } from '../lib';

/**
 * Procure-to-Pay: order ten from a vendor, receive them in two deliveries, take
 * the bill through the three-way match, pay it — then the same chain with the
 * bill arriving BEFORE the last delivery, an order that is amended and a wrong
 * bill that is disputed and credited, and the expense-report side flow.
 * The end state that must hold: never more received than ordered, never more
 * billed than received, no payment without match + approval, the interim
 * account (GRNI) back at zero when goods and bill have met, and the cost that
 * leaves with a sale is the price that was paid for the goods.
 */
async function run(s: Scenario): Promise<void> {
  const vendor = await s.must('a vendor is onboarded', 'manage_vendor', {
    action: 'create', name: `Battery Rosteri ${s.tag}`, email: `rosteri-${s.tag}@example.test`, payment_terms: 'net30', currency: 'SEK',
  });
  const vendorId = s.idOf(vendor, 'vendor');
  const product = await s.must('a tracked product exists (sales price 300 kr, catalogue cost 90 kr)', 'manage_product', {
    action: 'create', name: `Battery coffee ${s.tag}`, price_cents: 30_000, cost_cents: 9_000, track_inventory: true,
  });
  const productId = s.idOf(product, 'product');

  // ── Order ──────────────────────────────────────────────────────────────────
  await s.mustRefuse('a vendor NAME instead of the vendor id is refused', 'create_purchase_order', {
    vendor_id: `Battery Rosteri ${s.tag}`, lines: [{ product_id: productId, description: 'Coffee', quantity: 1, unit_price_cents: 10_000, tax_rate: 25 }],
  }, /vendor|uuid/i);
  const po = await order(s, vendorId, productId);
  const poRow = await s.one<{ status: string; subtotal_cents: number; tax_cents: number; total_cents: number; po_number: string }>(
    'select status::text, subtotal_cents, tax_cents, total_cents, po_number from purchase_orders where id = $1', [po.id]);
  s.equal('a new purchase order is a draft', poRow?.status, 'draft');
  s.equal('10 × 100 kr is 1 000 kr net', poRow?.subtotal_cents, 100_000);
  s.equal('25 % VAT is 250 kr', poRow?.tax_cents, 25_000);
  s.equal('the order totals 1 250 kr', poRow?.total_cents, 125_000);

  await s.mustRefuse('goods cannot be received on a draft order', 'receive_purchase_order',
    { purchase_order_id: po.id, lines: [{ po_line_id: po.lineId, quantity_received: 1 }] }, /status draft/i);
  await s.must('the order is sent to the vendor', 'send_purchase_order', { purchase_order_id: po.id });
  s.equal('the order is sent', await poStatus(s, po.id), 'sent');

  // ── Receive in two deliveries ──────────────────────────────────────────────
  const first = await s.must('six units arrive', 'receive_purchase_order', { purchase_order_id: po.id, lines: [{ po_line_id: po.lineId, quantity_received: 6 }] });
  s.equal('a short delivery leaves the order partially received', first.po_status, 'partially_received');
  s.equal('six units are on the shelf', await onHand(s, productId), 6);
  await s.booksBalance('the receipt reaches the books, balanced', `e.source = 'inventory_receipt' and e.reference_number = $1`, [String(first.receipt_id)]);
  s.equal('the first delivery is valued at the purchase price', (await grni(s, po.id)).received, 60_000);

  const second = await s.must('a delivery note for nine arrives — only four are outstanding', 'receive_purchase_order',
    { purchase_order_id: po.id, lines: [{ po_line_id: po.lineId, quantity_received: 9 }] });
  s.equal('the over-delivery is capped at what was ordered', second.total_quantity, 4);
  s.equal('never more received than ordered', (await s.one<{ q: number }>('select received_quantity as q from purchase_order_lines where id = $1', [po.lineId]))?.q, 10);
  s.equal('the order is fully received', await poStatus(s, po.id), 'received');
  s.equal('ten units are on the shelf', await onHand(s, productId), 10);
  s.equal('the catalog mirror follows the receipts', (await s.one<{ q: number }>('select stock_quantity as q from products where id = $1', [productId]))?.q, 10);
  await s.mustRefuse('a fully received order takes no more goods', 'receive_purchase_order',
    { purchase_order_id: po.id, lines: [{ po_line_id: po.lineId, quantity_received: 1 }] }, /status received|no valid lines/i);
  s.equal('goods received, not yet invoiced: 1 000 kr', (await grni(s, po.id)).open, 100_000);

  // ── Bill, match, approve, pay ──────────────────────────────────────────────
  const bill = await s.must('the vendor invoice is registered', 'register_vendor_invoice', {
    vendor_id: vendorId, purchase_order_id: po.id, invoice_number: `F-${s.tag}-1`, invoice_date: today(), due_date: today(),
    subtotal_cents: 100_000, tax_cents: 25_000, total_cents: 125_000, currency: 'SEK',
  });
  const billId = s.idOf(bill, 'vendor_invoice');
  await s.booksBalance('the bill is booked when it is registered, balanced', `e.source = 'vendor_invoice' and e.reference_number = $1`, [billId]);
  const booked = await billLines(s, billId);
  s.equal('the bill closes the interim account with the net', booked.grni, 100_000);
  s.equal('input VAT is deductible', booked.vatIn, 25_000);
  s.equal('the payable is the bill total', booked.ap, 125_000);

  await s.mustRefuse('an unmatched, unapproved bill cannot be paid', 'pay_vendor_invoice', { p_vendor_invoice_id: billId }, /approv|match/i);
  const matched = await s.must('the three-way match runs', 'match_invoice_to_receipt', { p_invoice_id: billId });
  s.equal('bill = order = receipt', matched.match_status, 'matched');
  await s.mustRefuse('a matched bill still needs approval before payment', 'pay_vendor_invoice', { p_vendor_invoice_id: billId }, /approv/i);
  await s.must('the matched bill is approved', 'auto_approve_vendor_invoice', { invoice_id: billId });
  s.equal('the bill is approved', await billStatus(s, billId), 'approved');
  const payment = await s.must('the bill is paid', 'pay_vendor_invoice', { p_vendor_invoice_id: billId });
  s.equal('the bill is paid', await billStatus(s, billId), 'paid');
  await s.booksBalance('the payment reaches the books, balanced', `e.id = $1`, [String(payment.journal_entry_id)]);
  await s.mustRefuse('a paid bill cannot be paid twice', 'pay_vendor_invoice', { p_vendor_invoice_id: billId }, /already paid/i);

  const net = await chainNet(s, po.id, vendorId);
  s.equal('net: inventory +1 000 kr', net.inventory, 100_000);
  s.equal('net: input VAT +250 kr', net.vatIn, 25_000);
  s.equal('net: bank −1 250 kr', net.bank, -125_000);
  s.equal('net: the interim account is back at zero', net.grni, 0);
  s.equal('net: the payable is settled', net.ap, 0);

  // ── The same delivery billed twice ─────────────────────────────────────────
  const dup = await s.must('a second bill for the same delivery arrives', 'register_vendor_invoice', {
    vendor_id: vendorId, purchase_order_id: po.id, invoice_number: `F-${s.tag}-1B`, invoice_date: today(),
    subtotal_cents: 100_000, tax_cents: 25_000, total_cents: 125_000, currency: 'SEK',
  });
  const dupId = s.idOf(dup, 'vendor_invoice');
  const dupMatch = await s.skill('match_invoice_to_receipt', { p_invoice_id: dupId });
  s.equal('a second bill for a billed delivery is over-invoiced', dupMatch.data.match_status, 'over_invoiced');
  // The refusal answers {success:false, reason, next} under an outer status "success" — there is
  // no `error`, so mustRefuse cannot read the why. Read it where the skill puts it.
  const dupApprove = await s.skill<{ reason?: string }>('auto_approve_vendor_invoice', { invoice_id: dupId });
  s.check('an over-invoiced bill is not approved', !dupApprove.ok && /over_invoiced|nothing left/i.test(String(dupApprove.data.reason)),
    JSON.stringify(dupApprove.data).slice(0, 300));
  await s.mustRefuse('an over-invoiced bill cannot be paid', 'pay_vendor_invoice', { p_vendor_invoice_id: dupId }, /approv|match|over/i);
  s.check('the duplicate bill stays unpaid', (await billStatus(s, dupId)) !== 'paid');

  // ── The seam: the cost that leaves is the price that was paid ──────────────
  const sale = await s.must('one unit is sold', 'place_order', { customer_email: `kund-${s.tag}@example.test`, items: [{ product_id: productId, quantity: 1 }] });
  const saleId = s.idOf(sale, 'order');
  await s.must('the sale is paid', 'manage_orders', { action: 'update_status', order_id: saleId, status: 'paid' });
  await s.must('the sale ships', 'manage_orders', { action: 'update_status', order_id: saleId, status: 'shipped' });
  s.equal('COGS is the 100 kr paid to the vendor, not the 90 kr catalogue cost', (await s.one<{ cents: string }>(
    `select coalesce(sum(l.debit_cents), 0) as cents from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.source = 'inventory_cogs' and e.reference_number = $1 and l.account_code = public.account_for('cogs')`, [saleId]))?.cents, 10_000);
  s.equal('nine units remain', await onHand(s, productId), 9);

  // ── The bill arrives before the last delivery ──────────────────────────────
  const po2 = await order(s, vendorId, productId);
  await s.must('the second order is sent', 'send_purchase_order', { purchase_order_id: po2.id });
  await s.must('six of ten arrive', 'receive_purchase_order', { purchase_order_id: po2.id, lines: [{ po_line_id: po2.lineId, quantity_received: 6 }] });
  const earlyBill = await s.must('the vendor bills all ten', 'register_vendor_invoice', {
    vendor_id: vendorId, purchase_order_id: po2.id, invoice_number: `F-${s.tag}-2`, invoice_date: today(),
    subtotal_cents: 100_000, tax_cents: 25_000, total_cents: 125_000, currency: 'SEK',
  });
  const earlyBillId = s.idOf(earlyBill, 'vendor_invoice');
  const earlyMatch = await s.skill('match_invoice_to_receipt', { p_invoice_id: earlyBillId });
  s.equal('ten billed against six received is over-invoiced', earlyMatch.data.match_status, 'over_invoiced');
  await s.mustRefuse('billed beyond received cannot be paid', 'pay_vendor_invoice', { p_vendor_invoice_id: earlyBillId }, /approv|match|over/i);
  await s.must('the last four arrive', 'receive_purchase_order', { purchase_order_id: po2.id, lines: [{ po_line_id: po2.lineId, quantity_received: 4 }] });
  const rematch = await s.must('the match is run again', 'match_invoice_to_receipt', { p_invoice_id: earlyBillId });
  s.equal('with everything received the bill matches', rematch.match_status, 'matched');
  await s.must('the bill is approved', 'auto_approve_vendor_invoice', { invoice_id: earlyBillId });
  await s.must('the bill is paid', 'pay_vendor_invoice', { p_vendor_invoice_id: earlyBillId });
  const net2 = await chainNet(s, po2.id, vendorId);
  // FINDING 2026-09-19: the bill is booked the second it is registered, against the GRNI that is
  // open THEN (600 kr). The 400 kr not yet received goes to purchase price variance; the later
  // receipt credits GRNI 400 kr that no bill ever closes. Goods and bill have met, GRNI has not.
  s.equal('goods and bill have met: the interim account is zero', net2.grni, 0);
  s.equal('no price variance on a bill at the ordered price', net2.ppv, 0);
  s.equal('the second chain: inventory +1 000 kr', net2.inventory, 100_000);

  // ── The order changes, the bill is wrong, the vendor credits it ────────────
  const po3 = await order(s, vendorId, productId);
  await s.must('the third order is sent', 'send_purchase_order', { purchase_order_id: po3.id });
  const stale = await s.skill<{ error?: string }>('update_purchase_order', { action: 'update', purchase_order_id: po3.id, lines: [{ description: 'x', quantity: 1, unit_price_cents: 1 }] });
  s.check('rewriting lines through the general update names the door that does it', /amend_purchase_order/.test(JSON.stringify(stale.data)), JSON.stringify(stale.data).slice(0, 200));
  const amended = await s.must('the vendor raises the price to 110 kr — the order is amended', 'amend_purchase_order', {
    p_purchase_order_id: po3.id, p_reason: 'Vendor price list 2026 — 110 kr per kg', p_lines: [{ line_id: po3.lineId, unit_price_cents: 11_000 }],
  });
  s.equal('the amendment is revision 1', amended.revision_number, 1);
  s.equal('the order now totals 1 375 kr', (await s.one<{ total_cents: number }>('select total_cents from purchase_orders where id = $1', [po3.id]))?.total_cents, 137_500);
  s.equal('the revision remembers the old total', amended.prev_total_cents, 125_000);
  await s.mustRefuse('an amendment that changes nothing records no revision', 'amend_purchase_order', {
    p_purchase_order_id: po3.id, p_reason: 'Same again', p_lines: [{ line_id: po3.lineId, unit_price_cents: 11_000 }],
  }, /nothing changed/i);
  await s.mustRefuse('an amendment needs a reason', 'amend_purchase_order', { p_purchase_order_id: po3.id, p_reason: '', p_expected_delivery: today() }, /reason/i);
  await s.must('all ten arrive', 'receive_purchase_order', { purchase_order_id: po3.id, lines: [{ po_line_id: po3.lineId, quantity_received: 10 }] });
  await s.mustRefuse('a fully received order can no longer be amended', 'amend_purchase_order', {
    p_purchase_order_id: po3.id, p_reason: 'Two fewer', p_lines: [{ line_id: po3.lineId, quantity: 8 }],
  }, /no longer be amended|already received/i);
  const history = await s.must('the amendment history is readable', 'list_po_revisions', { p_purchase_order_id: po3.id });
  s.equal('one revision is on file', (history.revisions as unknown[])?.length, 1);

  const wrongBill = await s.must('the vendor bills 120 kr per unit', 'register_vendor_invoice', {
    vendor_id: vendorId, purchase_order_id: po3.id, invoice_number: `F-${s.tag}-3`, invoice_date: today(),
    subtotal_cents: 120_000, tax_cents: 30_000, total_cents: 150_000, currency: 'SEK',
  });
  const wrongBillId = s.idOf(wrongBill, 'vendor_invoice');
  s.equal('120 kr billed against 110 kr ordered is over-invoiced', (await s.skill('match_invoice_to_receipt', { p_invoice_id: wrongBillId })).data.match_status, 'over_invoiced');
  const dispute = await s.must('a dispute is opened on the bill', 'open_vendor_dispute', {
    p_vendor_invoice_id: wrongBillId, p_reason: 'Billed 120 kr, the amended order says 110 kr', p_disputed_amount_cents: 12_500,
  });
  const again = await s.must('opening it twice is the same dispute', 'open_vendor_dispute', { p_vendor_invoice_id: wrongBillId, p_reason: 'Billed 120 kr again' });
  s.equal('a bill has one open dispute', again.dispute_id, dispute.dispute_id);
  await s.mustRefuse('a bill under dispute cannot be paid', 'pay_vendor_invoice', { p_vendor_invoice_id: wrongBillId }, /dispute/i);
  await s.mustRefuse('a credit cannot exceed the bill', 'issue_vendor_credit_memo', { p_amount_cents: 150_001, p_reason: 'Too much', p_vendor_invoice_id: wrongBillId }, /exceed/i);
  const resolved = await s.must('the vendor credits the difference — the dispute is resolved', 'resolve_vendor_dispute', {
    p_dispute_id: dispute.dispute_id, p_resolution: 'Vendor credits 10 kr per unit', p_credit_amount_cents: 12_500, p_credit_number: `KR-${s.tag}-3`,
  });
  const credit = (resolved.credit ?? {}) as { credit_memo_id?: string; booking?: { journal_entry_id?: string; vat_cents?: number; net_cents?: number } };
  await s.booksBalance('the credit memo reaches the books, balanced', `e.id = $1`, [String(credit.booking?.journal_entry_id)]);
  s.equal('the credit reverses its share of the input VAT: 25 kr', credit.booking?.vat_cents, 2_500);
  let editRefused = false;
  try { await s.sql(`update vendor_credit_memos set amount_cents = 1 where id = $1`, [String(credit.credit_memo_id)]); } catch { editRefused = true; }
  s.check('an applied credit memo is final', editRefused);
  const rematched = await s.must('the match is run again', 'match_invoice_to_receipt', { p_invoice_id: wrongBillId });
  s.equal('the credited bill matches the order', rematched.match_status, 'matched');
  await s.must('the credited bill is approved', 'auto_approve_vendor_invoice', { invoice_id: wrongBillId });
  const netPayment = await s.must('the credited bill is paid', 'pay_vendor_invoice', { p_vendor_invoice_id: wrongBillId });
  s.equal('the payment is the bill minus the credit: 1 375 kr', netPayment.paid_cents, 137_500);
  const chain3 = await s.one<{ ap: string; ppv: string }>(
    `select coalesce(sum(l.credit_cents - l.debit_cents) filter (where l.account_code = public.account_for('accounts_payable')), 0) as ap,
            coalesce(sum(l.debit_cents - l.credit_cents) filter (where l.account_code = public.account_for('purchase_price_variance')), 0) as ppv
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where (e.source = 'vendor_invoice' and e.reference_number = $1)
         or (e.source = 'vendor_credit_memo' and e.reference_number = $2)
         or e.id = $3`, [wrongBillId, String(credit.credit_memo_id), String(netPayment.journal_entry_id)]);
  s.equal('bill, credit and payment leave nothing owed', Number(chain3?.ap), 0);
  s.equal('the credit takes back the price variance the wrong bill booked', Number(chain3?.ppv), 0);

  const loose = await s.must('a goodwill credit against the vendor is registered, not yet applied', 'issue_vendor_credit_memo', {
    p_amount_cents: 5_000, p_reason: 'Goodwill for the late delivery', p_vendor_id: vendorId, p_apply: false,
  });
  let handApplied = true;
  try { await s.sql(`update vendor_credit_memos set status = 'applied', applied_at = now() where id = $1`, [String(loose.credit_memo_id)]); } catch { handApplied = false; }
  s.check('a credit memo cannot be marked applied by hand — applied means booked', !handApplied);
  const appliedLoose = await s.must('the memo is applied through its door', 'apply_vendor_credit_memo', { p_credit_memo_id: loose.credit_memo_id });
  await s.booksBalance('the goodwill credit is booked, balanced', `e.id = $1`, [String(appliedLoose.journal_entry_id)]);
  s.equal('applying it twice is the same booking', (await s.must('the memo is applied again', 'apply_vendor_credit_memo', { p_credit_memo_id: loose.credit_memo_id })).journal_entry_id, appliedLoose.journal_entry_id);

  await s.must('the buyer rates the vendor', 'rate_vendor', { p_vendor_id: vendorId, p_rating: 4.5, p_notes: 'Credits quickly when wrong' });
  await s.mustRefuse('a rating is 0–5', 'rate_vendor', { p_vendor_id: vendorId, p_rating: 9 }, /0.5/);
  const card = await s.must('the vendor scorecard is readable', 'vendor_scorecard', { p_vendor_id: vendorId });
  const cardRow = ((card.vendors as Array<Record<string, unknown>>) ?? [])[0] ?? {};
  s.equal('the scorecard counts the three orders', Number(cardRow.po_count), 3);
  s.equal('the scorecard carries the manual rating', Number(cardRow.manual_rating), 4.5);

  // ── Expenses: the month-end loop ───────────────────────────────────────────
  // No skill creates a login; expenses.user_id carries no foreign key, so the employee is an id.
  const employee = randomUUID();
  const period = today().slice(0, 7);
  await s.must('a receipt is filed: office supplies 1 250 kr incl. 250 kr VAT', 'manage_expenses', {
    action: 'create', user_id: employee, expense_date: today(), description: `Battery toner ${s.tag}`, amount_cents: 125_000, vat_cents: 25_000, category: 'office', vendor: 'Kontorsbolaget',
  });
  await s.must('a second receipt: train 530 kr incl. 30 kr VAT', 'manage_expenses', {
    action: 'create', user_id: employee, expense_date: today(), description: `Battery train ${s.tag}`, amount_cents: 53_000, vat_cents: 3_000, category: 'travel', vendor: 'SJ',
  });
  s.skip('analyze_receipt reads the photographed receipt', 'needs an AI provider');
  const report = await s.must('the monthly report gathers the loose receipts', 'generate_monthly_expense_report', { period, user_id: employee });
  const reportId = s.idOf(report, 'report');
  s.equal('both receipts are attached', report.expenses_attached, 2);
  const againReport = await s.must('the report is generated a second time', 'generate_monthly_expense_report', { period, user_id: employee });
  s.equal('one report per employee and month', againReport.report_id, reportId);

  await s.mustRefuse('a draft report cannot be approved', 'approve_expense_report', { p_report_id: reportId }, /only submitted/i);
  await s.mustRefuse('a draft report cannot be booked', 'book_expense_report', { p_report_id: reportId }, /only approved/i);
  const submitted = await s.must('the employee submits', 'submit_expense_report', { p_report_id: reportId });
  s.equal('the report totals 1 780 kr', submitted.total_cents, 178_000);
  s.equal('submitting locks the receipts', (await s.one<{ n: string }>(`select count(*) as n from expenses where report_id = $1 and status = 'submitted'`, [reportId]))?.n, 2);
  await s.mustRefuse('a submitted report cannot be paid', 'mark_expense_report_paid', { p_report_id: reportId }, /only booked/i);

  await s.must('the manager approves', 'approve_expense_report', { p_report_id: reportId });
  s.check('approval waited for a human', s.handshakes.some((h) => h.skill === 'approve_expense_report' && h.gate === 'human'),
    `handshakes: ${JSON.stringify(s.handshakes)}`);
  const bookedReport = await s.must('the report is booked', 'book_expense_report', { p_report_id: reportId });
  const reportRow = await s.one<{ status: string; journal_entry_id: string | null }>('select status, journal_entry_id from expense_reports where id = $1', [reportId]);
  s.equal('the report is booked', reportRow?.status, 'booked');
  s.check('the report keeps its journal entry', reportRow?.journal_entry_id != null, JSON.stringify(bookedReport).slice(0, 200));
  await s.booksBalance('the expense entry balances', 'e.id = $1', [String(reportRow?.journal_entry_id)]);
  const expenseEntry = await s.one<{ vat: string; owed: string; cost: string }>(
    `select coalesce(sum(debit_cents) filter (where account_code = public.account_for('vat_input')), 0) as vat,
            coalesce(sum(credit_cents) filter (where account_code = public.account_for('employee_liability')), 0) as owed,
            coalesce(sum(debit_cents) filter (where account_code not in (public.account_for('vat_input'))), 0) as cost
       from journal_entry_lines where journal_entry_id = $1`, [reportRow?.journal_entry_id]);
  s.equal('input VAT 280 kr is split out', expenseEntry?.vat, 28_000);
  s.equal('the cost is booked net: 1 500 kr', expenseEntry?.cost, 150_000);
  s.equal('1 780 kr is owed to the employee', expenseEntry?.owed, 178_000);
  await s.mustRefuse('a booked report cannot be booked twice', 'book_expense_report', { p_report_id: reportId }, /only approved/i);

  await s.must('the employee is reimbursed', 'mark_expense_report_paid', { p_report_id: reportId, p_method: 'bankgiro', p_reference: `BG-${s.tag}` });
  s.equal('the report is paid', (await s.one<{ status: string }>('select status from expense_reports where id = $1', [reportId]))?.status, 'paid');
  const payout = await s.one<{ n: string; cents: string }>('select count(*) as n, coalesce(sum(amount_cents), 0) as cents from expense_payments where report_id = $1', [reportId]);
  s.equal('one payout is recorded', payout?.n, 1);
  s.equal('the payout is the report total', payout?.cents, 178_000);
  const owedAfter = await s.one<{ net: string }>(
    `select coalesce(sum(l.credit_cents - l.debit_cents), 0) as net from journal_entry_lines l
      where l.account_code = public.account_for('employee_liability')
        and l.journal_entry_id in (select journal_entry_id from expense_reports where id = $1
                                   union select journal_entry_id from expense_payments where report_id = $1)`, [reportId]);
  s.equal('nothing is owed to the employee any more', owedAfter?.net, 0);
  await s.mustRefuse('a paid report cannot be paid twice', 'mark_expense_report_paid', { p_report_id: reportId }, /only booked/i);

  s.skip('the PO reaches the vendor by email', 'needs an email provider');

  // ── Multi-step receiving: receive → QC → putaway (agent surface since 2026-10-05) ──
  // Its own product so the stock checks above are untouched. One line passes QC, one fails;
  // only the passed line becomes stock.
  const qcProduct = s.idOf(await s.must('a product for inspected goods', 'manage_product', {
    action: 'create', name: `Battery QC goods ${s.tag}`, price_cents: 5_000, cost_cents: 2_000, track_inventory: true,
  }), 'product');
  const shelf = await s.one<{ id: string }>(`select id from stock_locations where location_type = 'internal' order by created_at limit 1`);
  const receipt = await s.must('goods arrive on a receipt that needs inspection', 'manage_inventory_receipt', {
    p_action: 'create', p_vendor_id: vendorId,
    p_lines: [{ product_id: qcProduct, quantity: 8, target_location_id: shelf?.id }, { product_id: qcProduct, quantity: 2, target_location_id: shelf?.id }],
  });
  const receiptId = String(receipt.receipt_id);
  s.equal('the receipt starts as received with two lines', `${receipt.status}/${receipt.lines}`, 'received/2');
  await s.must('the receipt moves to quality check', 'manage_inventory_receipt', { p_action: 'advance', p_receipt_id: receiptId, p_to_status: 'quality_check' });
  const lines = await s.sql<{ id: string; quantity: string }>('select id, quantity from inventory_receipt_lines where receipt_id = $1 order by quantity desc', [receiptId]);
  await s.must('eight units pass inspection', 'manage_inventory_receipt', { p_action: 'set_qc', p_line_id: lines[0]?.id, p_qc_status: 'passed' });
  await s.must('two units fail inspection', 'manage_inventory_receipt', { p_action: 'set_qc', p_line_id: lines[1]?.id, p_qc_status: 'failed', p_qc_notes: 'crushed boxes' });
  const putaway = await s.must('the inspected goods are put away', 'manage_inventory_receipt', { p_action: 'advance', p_receipt_id: receiptId, p_to_status: 'putaway' });
  s.equal('one putaway move — the failed line stays out', putaway.putaway_moves, 1);
  s.equal('only the eight that passed are stock', await onHand(s, qcProduct), 8);
  await s.must('the receipt is closed', 'manage_inventory_receipt', { p_action: 'advance', p_receipt_id: receiptId, p_to_status: 'done' });
  const listed = await s.must('open receipts are listed', 'manage_inventory_receipt', { p_action: 'list', p_status: 'done' });
  s.check('the closed receipt is in the done list with its failed line counted',
    ((listed.receipts as Array<{ id: string; failed_qc: number }>) ?? []).some((r) => r.id === receiptId && Number(r.failed_qc) === 1), JSON.stringify(listed).slice(0, 200));

  // ── Blanket agreement and call-offs (since 2026-10-05) ──
  // 100 units agreed at 42 kr. Call-offs are ordinary draft POs at the agreed
  // price; what is left is the call-offs themselves, so a cancelled one gives
  // its quantity back and nothing can be called past the ceiling.
  const agreement = await s.must('a yearly agreement for 100 units at 42 kr is drafted', 'manage_purchase_agreement', {
    p_action: 'create', p_vendor_id: vendorId,
    p_lines: [{ product_id: productId, description: 'Coffee 1 kg — yearly agreement', quantity: 100, unit_price_cents: 4_200, tax_rate: 25 }],
  });
  const agreementId = String(agreement.agreement_id);
  await s.mustRefuse('a draft agreement cannot be called off', 'call_off_purchase_agreement',
    { p_agreement_id: agreementId, p_lines: [] }, /draft/);
  await s.must('the agreement is activated', 'manage_purchase_agreement', { p_action: 'activate', p_agreement_id: agreementId });
  const snap0 = await s.must('the agreement is readable with its line', 'manage_purchase_agreement', { p_action: 'get', p_agreement_id: agreementId });
  const agreementLine = String((snap0.lines as Array<{ id: string }>)[0]?.id);
  const callOff = await s.must('30 units are called off', 'call_off_purchase_agreement', {
    p_agreement_id: agreementId, p_lines: [{ agreement_line_id: agreementLine, quantity: 30 }],
  });
  const callOffPo = String(callOff.purchase_order_id);
  s.equal('the call-off is a draft PO at the agreed price (30 × 42 kr + 25 %)', `${await poStatus(s, callOffPo)}/${callOff.total_cents}`, 'draft/157500');
  const afterFirst = (callOff.agreement as { lines: Array<{ remaining_quantity: number }> }).lines[0];
  s.equal('70 are left on the agreement', afterFirst?.remaining_quantity, 70);
  await s.mustRefuse('a call-off past what is left is refused', 'call_off_purchase_agreement',
    { p_agreement_id: agreementId, p_lines: [{ agreement_line_id: agreementLine, quantity: 71 }] }, /exceeds agreement/);
  await s.must('the call-off is sent like any order', 'send_purchase_order', { purchase_order_id: callOffPo });
  const callOffLine = await s.one<{ id: string }>('select id from purchase_order_lines where purchase_order_id = $1', [callOffPo]);
  await s.must('the called-off goods arrive', 'receive_purchase_order', {
    purchase_order_id: callOffPo, lines: [{ po_line_id: callOffLine?.id, quantity_received: 30 }],
  });
  const secondCallOff = await s.must('a second call-off of 50 is placed', 'call_off_purchase_agreement', {
    p_agreement_id: agreementId, p_lines: [{ agreement_line_id: agreementLine, quantity: 50 }],
  });
  await s.must('the second call-off is cancelled', 'update_purchase_order', { action: 'update', purchase_order_id: String(secondCallOff.purchase_order_id), status: 'cancelled' });
  const snap = await s.must('the agreement shows its progress', 'manage_purchase_agreement', { p_action: 'get', p_agreement_id: agreementId });
  const line = (snap.lines as Array<{ called_quantity: number; received_quantity: number; remaining_quantity: number }>)[0];
  s.equal('the cancelled call-off gave its 50 back: 30 called, 30 received, 70 left',
    `${line?.called_quantity}/${line?.received_quantity}/${line?.remaining_quantity}`, '30/30/70');
  s.equal('both call-offs are listed on the agreement', (snap.call_offs as unknown[]).length, 2);
  await s.must('the agreement is closed', 'manage_purchase_agreement', { p_action: 'close', p_agreement_id: agreementId });
  await s.mustRefuse('a closed agreement takes no call-offs', 'call_off_purchase_agreement',
    { p_agreement_id: agreementId, p_lines: [{ agreement_line_id: agreementLine, quantity: 1 }] }, /closed/);
}

const today = () => new Date().toISOString().slice(0, 10);

async function order(s: Scenario, vendorId: string, productId: string): Promise<{ id: string; lineId: string }> {
  const po = await s.must('ten units are ordered at 100 kr + 25 % VAT', 'create_purchase_order', {
    vendor_id: vendorId, order_date: today(), lines: [{ product_id: productId, description: 'Coffee 1 kg', quantity: 10, unit_price_cents: 10_000, tax_rate: 25 }],
  });
  const id = s.idOf(po, 'purchase_order');
  const line = await s.one<{ id: string }>('select id from purchase_order_lines where purchase_order_id = $1', [id]);
  return { id, lineId: String(line?.id) };
}

async function poStatus(s: Scenario, id: string): Promise<string | undefined> {
  return (await s.one<{ status: string }>('select status::text from purchase_orders where id = $1', [id]))?.status;
}

async function billStatus(s: Scenario, id: string): Promise<string | undefined> {
  return (await s.one<{ status: string }>('select status::text from vendor_invoices where id = $1', [id]))?.status;
}

async function onHand(s: Scenario, productId: string): Promise<number> {
  const row = await s.one<{ qty: string }>(
    `select coalesce(sum(q.quantity), 0) as qty from stock_quants q join stock_locations l on l.id = q.location_id
      where q.product_id = $1 and l.location_type = 'internal'`, [productId]);
  return Number(row?.qty ?? 0);
}

/** Every posted line that belongs to one purchase order: its receipts, its bills, its payments. */
const CHAIN = `
  select l.account_code, l.debit_cents, l.credit_cents, e.source
    from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
   where (e.source = 'inventory_receipt' and e.reference_number in (select id::text from goods_receipts where purchase_order_id = $1))
      or (e.source = 'vendor_invoice' and e.reference_number in (select id::text from vendor_invoices where purchase_order_id = $1))`;

async function grni(s: Scenario, poId: string): Promise<{ received: number; open: number }> {
  const row = await s.one<{ received: string; open: string }>(
    `select coalesce(sum(credit_cents) filter (where source = 'inventory_receipt'), 0) as received,
            coalesce(sum(credit_cents - debit_cents), 0) as open
       from (${CHAIN}) c where account_code = public.account_for('goods_received_not_invoiced')`, [poId]);
  return { received: Number(row?.received ?? 0), open: Number(row?.open ?? 0) };
}

async function billLines(s: Scenario, billId: string): Promise<{ grni: number; vatIn: number; ap: number }> {
  const row = await s.one<{ grni: string; vat: string; ap: string }>(
    `select coalesce(sum(l.debit_cents) filter (where l.account_code = public.account_for('goods_received_not_invoiced')), 0) as grni,
            coalesce(sum(l.debit_cents) filter (where l.account_code = public.account_for('vat_input')), 0) as vat,
            coalesce(sum(l.credit_cents) filter (where l.account_code = public.account_for('accounts_payable')), 0) as ap
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.source = 'vendor_invoice' and e.reference_number = $1`, [billId]);
  return { grni: Number(row?.grni ?? 0), vatIn: Number(row?.vat ?? 0), ap: Number(row?.ap ?? 0) };
}

/** Net debit − credit per role over the whole chain of one PO, payments of its PAID bills included. */
async function chainNet(s: Scenario, poId: string, vendorId: string): Promise<{ inventory: number; vatIn: number; bank: number; grni: number; ap: number; ppv: number }> {
  const paidNumbers = (await s.sql<{ invoice_number: string }>(
    `select invoice_number from vendor_invoices where purchase_order_id = $1 and paid_at is not null`, [poId])).map((r) => r.invoice_number);
  const row = await s.one<Record<'inventory' | 'vat' | 'bank' | 'grni' | 'ap' | 'ppv', string>>(
    `with lines as (
       select account_code, debit_cents, credit_cents from (${CHAIN}) c
       union all
       select l.account_code, l.debit_cents, l.credit_cents
         from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
        where e.source = 'vendor_payment' and e.vendor_id = $2
          and e.description = any (select 'Betalning leverantörsfaktura ' || n from unnest($3::text[]) n))
     select coalesce(sum(debit_cents - credit_cents) filter (where account_code = public.account_for('inventory')), 0) as inventory,
            coalesce(sum(debit_cents - credit_cents) filter (where account_code = public.account_for('vat_input')), 0) as vat,
            coalesce(sum(debit_cents - credit_cents) filter (where account_code = public.account_for('bank')), 0) as bank,
            coalesce(sum(debit_cents - credit_cents) filter (where account_code = public.account_for('goods_received_not_invoiced')), 0) as grni,
            coalesce(sum(debit_cents - credit_cents) filter (where account_code = public.account_for('accounts_payable')), 0) as ap,
            coalesce(sum(debit_cents - credit_cents) filter (where account_code = public.account_for('purchase_price_variance')), 0) as ppv
       from lines`, [poId, vendorId, paidNumbers]);
  return { inventory: Number(row?.inventory ?? 0), vatIn: Number(row?.vat ?? 0), bank: Number(row?.bank ?? 0), grni: Number(row?.grni ?? 0), ap: Number(row?.ap ?? 0), ppv: Number(row?.ppv ?? 0) };
}

export default { process: 'procure-to-pay', run } satisfies ScenarioModule;
