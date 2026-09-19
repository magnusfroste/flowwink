import type { Scenario, ScenarioModule } from '../lib';

/**
 * Order-to-Delivery: order three, pay, pick, ship, deliver — and the side roads
 * the doc names: oversell, cancellation before exit, partial fulfilment, a
 * service line. The end state that must hold: the sale is booked once when it
 * is paid (Dt clearing / Cr revenue + VAT, prices are incl. VAT), the cost
 * leaves the books WITH the goods and only once, every reservation is gone
 * when the goods are gone, and a cancelled order leaves no trace on the shelf.
 */
async function run(s: Scenario): Promise<void> {
  // FINDING 2026-09-19: manage_product's instructions say "a physical product should be born
  // stocked" (stock_quantity on create). That writes only the catalog mirror — no quant, no
  // move, no valuation layer. The shop says ten, the warehouse says zero, allocate_picking
  // reports the line short and shipping drives on-hand to −3.
  const born = await s.must('a product is born stocked, as the skill recommends', 'manage_product', {
    action: 'create', name: `Battery born-stocked ${s.tag}`, price_cents: 10_000, cost_cents: 4_000,
    track_inventory: true, stock_quantity: 10,
  });
  s.equal('a product born with ten has ten on the shelf', (await stock(s, s.idOf(born, 'product'))).onHand, 10);

  const product = await s.must('a tracked product exists', 'manage_product', {
    action: 'create', name: `Battery lamp ${s.tag}`, price_cents: 50_000, cost_cents: 20_000, track_inventory: true,
  });
  const productId = s.idOf(product, 'product');
  // No skill lists stock locations; adjust_quant needs the uuid. Read, not written.
  const main = await s.one<{ id: string }>(`select id from stock_locations where location_type = 'internal' and is_active order by created_at limit 1`);
  await s.must('ten units are counted in', 'adjust_quant', { p_product_id: productId, p_location_id: main!.id, p_qty_delta: 10, p_reason: 'initial seed' });
  const seeded = await stock(s, productId);
  s.equal('ten units are on the shelf', seeded.onHand, 10);
  s.equal('the catalog mirror follows the count', seeded.available, 10);

  // ── Oversell ───────────────────────────────────────────────────────────────
  const ordersBefore = await countOrders(s, `over-${s.tag}@example.test`);
  await s.mustRefuse('eleven units of a product with ten on the shelf is refused', 'place_order', {
    customer_email: `over-${s.tag}@example.test`, items: [{ product_id: productId, quantity: 11 }],
  }, /insufficient|stock|available/i);
  // FINDING 2026-09-19: placeOrderShared never reads the order_items insert error — the stock
  // guard refuses the LINE, and the ORDER HEAD stays behind with a total and no lines.
  s.equal('a refused order leaves no order behind', (await countOrders(s, `over-${s.tag}@example.test`)) - ordersBefore, 0);

  // ── Happy path ─────────────────────────────────────────────────────────────
  const email = `kund-${s.tag}@example.test`;
  const placed = await s.must('the customer orders three', 'place_order', {
    customer_email: email, customer_name: 'Battery Kund', items: [{ product_id: productId, quantity: 3 }],
  });
  const orderId = s.idOf(placed, 'order');
  const order = await s.one<{ total_cents: number; status: string; fulfillment_status: string }>(
    'select total_cents, status, fulfillment_status from orders where id = $1', [orderId]);
  s.equal('the order total is three times the price', order?.total_cents, 150_000);
  s.equal('a new order is pending', order?.status, 'pending');
  s.equal('a new order is unfulfilled', order?.fulfillment_status, 'unfulfilled');

  const committed = await stock(s, productId);
  s.equal('availability drops in the order second', committed.available, 7);
  s.equal('the goods are still on the shelf', committed.onHand, 10);
  s.equal('three units are reserved for the order', committed.reserved, 3);
  s.equal('an order that has not shipped has booked no cost', await cogsCents(s, orderId), 0);

  await s.must('the order is paid', 'manage_orders', { action: 'update_status', order_id: orderId, status: 'paid' });
  await s.booksBalance('the paid order reaches the books, balanced', `e.source = 'order_paid' and e.reference_number = $1`, [orderId]);
  const sale = await saleLines(s, orderId);
  s.equal('clearing is debited with what the customer paid', sale.clearingDebit, 150_000);
  s.equal('revenue is the price excl. 25 % VAT', sale.revenueCredit, 120_000);
  s.equal('output VAT is 25 % of the net', sale.vatCredit, 30_000);

  await s.must('paid is set a second time', 'manage_orders', { action: 'update_status', order_id: orderId, status: 'paid' });
  s.equal('the sale is booked once', await entryCount(s, 'order_paid', orderId), 1);

  const picking = await s.must('a picking order is allocated', 'allocate_picking', { p_order_id: orderId });
  const pickingId = String(picking.picking_order_id);
  const lines = (picking.lines ?? []) as Array<{ line_id: string; reserved: boolean }>;
  s.equal('the picking carries one line', lines.length, 1);
  s.check('the line is reserved, not short', lines[0]?.reserved === true, JSON.stringify(picking).slice(0, 300));
  const pick = await s.one<{ status: string; picking_number: string | null }>(
    'select status, picking_number from picking_orders where id = $1', [pickingId]);
  s.equal('the picking is ready', pick?.status, 'ready');
  s.check('the picking has its own number', /^PICK-\d{8}-/.test(String(pick?.picking_number)), `got "${pick?.picking_number}"`);

  // FINDING 2026-09-19: the order line already reserved these three units
  // (trigger_order_item_stock_decrement); allocate_picking reserves them AGAIN under the
  // picking. Three units sold hold six until the picking ships. The doc names the two
  // mechanisms; the probe below shows what it costs (a full-shelf order reads as short).
  s.equal('three units sold hold three units, not six', (await stock(s, productId)).reserved, 3);

  // FINDING 2026-09-19: confirm_pick accepts any quantity — five picked on a line of three.
  await s.mustRefuse('picking five on a line of three is refused', 'confirm_pick',
    { p_line_id: lines[0].line_id, p_qty_picked: 5 }, /exceed|more than|requested/i);
  const picked = await s.must('the line is picked in full', 'confirm_pick', { p_line_id: lines[0].line_id, p_qty_picked: 3 });
  s.check('the pick reports every line done', picked.all_done === true, JSON.stringify(picked));

  const shipped = await s.must('the picking ships', 'ship_picking', { p_picking_order_id: pickingId, p_tracking_number: `TRK-${s.tag}` });
  s.check('shipping consumed every reservation it found', shipped.consumed_lines === shipped.reserved_lines
    && ((shipped.failed_lines ?? []) as unknown[]).length === 0, JSON.stringify(shipped).slice(0, 300));
  const afterShip = await s.one<{ status: string; fulfillment_status: string; shipped_at: Date | null; tracking_number: string | null; pstatus: string }>(
    `select o.status, o.fulfillment_status, o.shipped_at, o.tracking_number, p.status as pstatus
       from orders o join picking_orders p on p.id = $2 where o.id = $1`, [orderId, pickingId]);
  s.equal('the picking is shipped', afterShip?.pstatus, 'shipped');
  s.equal('the order is shipped on the fulfilment axis', afterShip?.fulfillment_status, 'shipped');
  s.equal('shipping leaves the payment axis alone', afterShip?.status, 'paid');
  s.check('shipped_at is stamped', afterShip?.shipped_at != null);
  s.equal('the tracking number reaches the order', afterShip?.tracking_number, `TRK-${s.tag}`);

  const gone = await stock(s, productId);
  s.equal('three units have left the shelf', gone.onHand, 7);
  s.equal('no reservation outlives the shipment', gone.reserved, 0);
  s.equal('availability is what is on the shelf', gone.available, 7);
  await s.booksBalance('the cost leaves with the goods, balanced', `e.source = 'inventory_cogs' and e.reference_number = $1`, [orderId]);
  s.equal('COGS is three units at cost', await cogsCents(s, orderId), 60_000);

  const reship = await s.must('the picking is shipped a second time', 'ship_picking', { p_picking_order_id: pickingId });
  s.check('the second shipment is a no-op', reship.already_shipped === true, JSON.stringify(reship));
  await s.must('the order is delivered', 'manage_orders', { action: 'update_status', order_id: orderId, status: 'delivered' });
  const delivered = await s.one<{ status: string; fulfillment_status: string; delivered_at: Date | null }>(
    'select status, fulfillment_status, delivered_at from orders where id = $1', [orderId]);
  s.equal('the order is delivered', delivered?.fulfillment_status, 'delivered');
  s.equal('a delivered order still reads as paid', delivered?.status, 'paid');
  s.check('delivered_at is stamped', delivered?.delivered_at != null);
  s.equal('delivery does not take the goods out a second time', (await stock(s, productId)).onHand, 7);
  s.equal('delivery does not book the cost a second time', await cogsCents(s, orderId), 60_000);

  await s.mustRefuse('a status outside both axes is refused', 'manage_orders',
    { action: 'update_status', order_id: orderId, status: 'teleported' }, /unknown order status/i);

  // ── Cancellation before exit is a ledger non-event ─────────────────────────
  const doomed = await s.must('a second order for two is placed', 'place_order', {
    customer_email: email, items: [{ product_id: productId, quantity: 2 }],
  });
  const doomedId = s.idOf(doomed, 'order');
  s.equal('the second order commits two more', (await stock(s, productId)).available, 5);
  await s.must('the second order is cancelled before it ships', 'manage_orders', { action: 'update_status', order_id: doomedId, status: 'cancelled' });
  const restored = await stock(s, productId);
  s.equal('cancellation gives the availability back', restored.available, 7);
  s.equal('cancellation releases the reservation', restored.reserved, 0);
  s.equal('cancellation moves no goods', restored.onHand, 7);
  s.equal('a cancelled order has booked no cost', await cogsCents(s, doomedId), 0);

  // ── Partial fulfilment + a service line ────────────────────────────────────
  const service = await s.must('a service product exists', 'manage_product', {
    action: 'create', name: `Battery installation ${s.tag}`, price_cents: 100_000, track_inventory: false,
  });
  const serviceId = s.idOf(service, 'product');
  const mixed = await s.must('an order with goods and a service is placed', 'place_order', {
    customer_email: email, items: [{ product_id: productId, quantity: 2 }, { product_id: serviceId, quantity: 1 }],
  });
  const mixedId = s.idOf(mixed, 'order');
  s.equal('the mixed order totals 2 × 500 + 1 000 kr', (await s.one<{ total_cents: number }>(
    'select total_cents from orders where id = $1', [mixedId]))?.total_cents, 200_000);
  await s.must('the mixed order is paid', 'manage_orders', { action: 'update_status', order_id: mixedId, status: 'paid' });
  const items = await s.sql<{ id: string; product_id: string }>('select id, product_id from order_items where order_id = $1', [mixedId]);
  const goodsLine = items.find((i) => i.product_id === productId)!;
  const serviceLine = items.find((i) => i.product_id === serviceId)!;

  const half = await s.must('one of the two units is fulfilled', 'fulfill_order_line', { p_line_id: goodsLine.id, p_qty: 1 });
  s.equal('the order is not fully fulfilled yet', half.order_fully_fulfilled, false);
  s.equal('a half-fulfilled order has not shipped', (await s.one<{ f: string }>(
    'select fulfillment_status as f from orders where id = $1', [mixedId]))?.f, 'unfulfilled');
  // FINDING 2026-09-19 (if red): fulfill_order_line clamps silently — asking for 5 of 1 remaining
  // answers success. A clamp is not a refusal, so the assertion is on the stored quantity.
  await s.skill('fulfill_order_line', { p_line_id: goodsLine.id, p_qty: 5 });
  s.equal('a line is never fulfilled beyond what was ordered', Number((await s.one<{ q: string }>(
    'select qty_fulfilled as q from order_items where id = $1', [goodsLine.id]))?.q), 2);
  const done = await s.must('the service line is fulfilled', 'fulfill_order_line', { p_line_id: serviceLine.id });
  s.equal('the last line completes the order', done.order_fully_fulfilled, true);
  const mixedEnd = await s.one<{ f: string; shipped_at: Date | null }>('select fulfillment_status as f, shipped_at from orders where id = $1', [mixedId]);
  s.equal('the order ships when every line is complete', mixedEnd?.f, 'shipped');
  s.check('the completed order has shipped_at', mixedEnd?.shipped_at != null);
  s.equal('only the goods carry cost — two units', await cogsCents(s, mixedId), 40_000);
  s.equal('a service line moves no stock', (await s.one<{ n: string }>(
    'select count(*) as n from stock_moves where product_id = $1', [serviceId]))?.n, 0);

  // ── Probe: the last three on the shelf ─────────────────────────────────────
  const last = await s.must('a product with exactly three on the shelf exists', 'manage_product', {
    action: 'create', name: `Battery last-three ${s.tag}`, price_cents: 20_000, cost_cents: 8_000, track_inventory: true,
  });
  const lastId = s.idOf(last, 'product');
  await s.must('three units are counted in', 'adjust_quant', { p_product_id: lastId, p_location_id: main!.id, p_qty_delta: 3, p_reason: 'initial seed' });
  const lastOrder = await s.must('all three are ordered and paid', 'place_order', {
    customer_email: email, items: [{ product_id: lastId, quantity: 3 }],
  });
  const lastOrderId = s.idOf(lastOrder, 'order');
  await s.must('the probe order is paid', 'manage_orders', { action: 'update_status', order_id: lastOrderId, status: 'paid' });
  const lastPicking = await s.must('its picking is allocated', 'allocate_picking', { p_order_id: lastOrderId });
  const lastPickingId = String(lastPicking.picking_order_id);
  // FINDING 2026-09-19: the order's own auto-reservation holds the three units, so the picking's
  // reserve_stock finds "free 0, need 3" and marks the line SHORT — for goods that are on the
  // shelf and held for this very order.
  s.equal('goods held for the order are not short for its own picking', lastPicking.lines_short, 0);

  // FINDING 2026-09-19: allocate_picking reuses the open picking HEAD but loops the order lines
  // again — every repeat adds a duplicate picking line (and a second reservation when stock allows).
  const again = await s.must('allocate_picking is called a second time', 'allocate_picking', { p_order_id: lastOrderId });
  s.equal('the second call reuses the open picking', again.picking_order_id, lastPickingId);
  s.equal('a repeated allocation adds no second line', await pickingLineCount(s, lastPickingId), 1);

  // FINDING 2026-09-19: ship_picking checks only shipped/cancelled — a 'ready' picking with no
  // confirmed line ships, the order flips to shipped and the cost is booked for goods nobody picked.
  await s.mustRefuse('a picking nobody has picked cannot ship', 'ship_picking',
    { p_picking_order_id: lastPickingId }, /pick|not ready|status/i);

  s.skip('order confirmation and delivery notification reach the customer', 'needs an email provider');
  s.skip('the Stripe webhook flips the order to paid', 'needs Stripe — paid is set through manage_orders instead');
}

async function stock(s: Scenario, productId: string): Promise<{ onHand: number; reserved: number; available: number }> {
  const q = await s.one<{ qty: string; reserved: string }>(
    `select coalesce(sum(q.quantity), 0) as qty, coalesce(sum(q.reserved_quantity), 0) as reserved
       from stock_quants q join stock_locations l on l.id = q.location_id
      where q.product_id = $1 and l.location_type = 'internal'`, [productId]);
  const p = await s.one<{ stock_quantity: number }>('select stock_quantity from products where id = $1', [productId]);
  return { onHand: Number(q?.qty ?? 0), reserved: Number(q?.reserved ?? 0), available: Number(p?.stock_quantity ?? 0) };
}

async function countOrders(s: Scenario, email: string): Promise<number> {
  return Number((await s.one<{ n: string }>('select count(*) as n from orders where customer_email = $1', [email]))?.n ?? 0);
}

async function pickingLineCount(s: Scenario, pickingId: string): Promise<number> {
  return Number((await s.one<{ n: string }>('select count(*) as n from picking_lines where picking_order_id = $1', [pickingId]))?.n ?? 0);
}

async function entryCount(s: Scenario, source: string, reference: string): Promise<number> {
  return Number((await s.one<{ n: string }>(
    'select count(*) as n from journal_entries where source = $1 and reference_number = $2', [source, reference]))?.n ?? 0);
}

async function cogsCents(s: Scenario, orderId: string): Promise<number> {
  const row = await s.one<{ cents: string }>(
    `select coalesce(sum(l.debit_cents), 0) as cents
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.source = 'inventory_cogs' and e.reference_number = $1 and l.account_code = public.account_for('cogs')`, [orderId]);
  return Number(row?.cents ?? 0);
}

async function saleLines(s: Scenario, orderId: string): Promise<{ clearingDebit: number; revenueCredit: number; vatCredit: number }> {
  const row = await s.one<{ clearing: string; revenue: string; vat: string }>(
    `select coalesce(sum(l.debit_cents) filter (where l.account_code = public.account_for_or('payment_clearing', 'bank')), 0) as clearing,
            coalesce(sum(l.credit_cents) filter (where l.account_code = public.account_for('sales_revenue')), 0) as revenue,
            coalesce(sum(l.credit_cents) filter (where l.account_code = public.account_for('vat_output')), 0) as vat
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.source = 'order_paid' and e.reference_number = $1`, [orderId]);
  return { clearingDebit: Number(row?.clearing ?? 0), revenueCredit: Number(row?.revenue ?? 0), vatCredit: Number(row?.vat ?? 0) };
}

export default { process: 'order-to-delivery', run } satisfies ScenarioModule;
