import type { Scenario, ScenarioModule } from '../lib';

/**
 * Return-to-Refund: sell three, take two back, pay the refund in two parts.
 * The end state that must hold: never more units back than were sold, never
 * more money out than was paid, the goods are back on the shelf once, and
 * every payout has a balanced journal entry against the booked sale.
 */
async function run(s: Scenario): Promise<void> {
  const product = await s.must('a stocked product exists', 'manage_product', {
    action: 'create', name: `Battery kettle ${s.tag}`, price_cents: 50_000, cost_cents: 20_000,
    track_inventory: true, stock_quantity: 10,
  });
  const productId = s.idOf(product, 'product');

  const placed = await s.must('the customer orders three', 'place_order', {
    customer_email: `kund-${s.tag}@example.test`, customer_name: `Battery Kund ${s.tag}`,
    items: [{ product_id: productId, quantity: 3 }],
  });
  const orderId = s.idOf(placed, 'order');
  const order = await s.one<{ total_cents: number }>('select total_cents from orders where id = $1', [orderId]);
  s.equal('the order total is three times the price', order?.total_cents, 150_000);

  await s.must('the order is paid', 'manage_orders', { action: 'update_status', order_id: orderId, status: 'paid' });
  await s.booksBalance('the paid order reaches the books, balanced', `e.source = 'order_paid' and e.reference_number = $1`, [orderId]);

  const stockBefore = await onHand(s, productId);

  const rma = await s.must('an RMA is opened on the order', 'create_return', {
    order_id: orderId, reason_code: 'changed_mind', reason: 'process battery',
  });
  const returnId = s.idOf(rma, 'return');
  const rmaNumber = String((rma.item as { rma_number?: string } | undefined)?.rma_number ?? '');
  s.check('the RMA number is generated', /^RMA-\d+$/.test(rmaNumber), `got "${rmaNumber}"`);

  await s.mustRefuse('ten units back on an order of three is refused', 'manage_return_item',
    { action: 'create', return_id: returnId, product_id: productId, quantity: 10, condition: 'unopened' }, /exceeds/i);
  await s.mustRefuse('a refund per unit above the price paid is refused', 'manage_return_item',
    { action: 'create', return_id: returnId, product_id: productId, quantity: 1, unit_refund_cents: 90_000, condition: 'unopened' }, /exceeds/i);
  await s.must('two unopened units go on the RMA', 'manage_return_item',
    { action: 'create', return_id: returnId, product_id: productId, quantity: 2, condition: 'unopened', restock: true });

  await s.must('the RMA is approved', 'approve_return', { return_id: returnId });
  await s.must('the parcel is received', 'receive_return', { return_id: returnId });
  await s.must('QC inspects — restock, no fee', 'inspect_return', { p_return_id: returnId, p_notes: 'sealed' });

  const stockAfter = await onHand(s, productId);
  s.equal('two units are back on the shelf, once', stockAfter - stockBefore, 2);

  await s.must('a first part of the refund is paid', 'refund_return', { return_id: returnId, refund_cents: 40_000, method: 'manual' });
  await s.mustRefuse('paying out more than what remains is refused', 'refund_return',
    { return_id: returnId, refund_cents: 60_001, method: 'manual' }, /exceed|remain|more than/i);
  await s.must('the rest is paid and the RMA closes itself', 'refund_return', { return_id: returnId, refund_cents: 60_000, method: 'manual' });

  const closed = await s.one<{ status: string; refund_cents: number }>(
    `select status, coalesce(refund_amount_cents, 0) as refund_cents from returns where id = $1`, [returnId]);
  s.equal('the RMA is refunded', closed?.status, 'refunded');
  s.equal('the running total equals the two units', closed?.refund_cents, 100_000);

  await s.booksBalance('every payout has a balanced entry', `e.source = 'return_refund' and e.reference_number = $1`, [rmaNumber]);
  const booked = await s.one<{ cents: string }>(
    `select coalesce(sum(l.credit_cents), 0) as cents
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.source = 'return_refund' and e.reference_number = $1`, [rmaNumber]);
  s.equal('the books carry exactly what was paid out', booked?.cents, 100_000);

  // The stock move — and so its journal entry — carries the RMA it came from (since 20260919170000;
  // before that the event's reference was dropped and the entry could only be found by its timestamp).
  const restocked = await s.one<{ cents: string }>(
    `select coalesce(sum(l.debit_cents), 0) as cents
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.source = 'inventory_return' and e.reference_number = $1`, [returnId]);
  s.equal('the goods back on the shelf are booked back at cost', restocked?.cents, 40_000);
}

async function onHand(s: Scenario, productId: string): Promise<number> {
  const row = await s.one<{ qty: string }>(
    `select coalesce(sum(q.quantity), 0) as qty from stock_quants q
       join stock_locations l on l.id = q.location_id
      where q.product_id = $1 and l.location_type = 'internal'`, [productId]);
  return Number(row?.qty ?? 0);
}

export default { process: 'return-to-refund', run } satisfies ScenarioModule;
