import type { Scenario, ScenarioModule } from '../lib';

/**
 * Plan-to-Produce: a finished good made of 2 × A + 1 × B, ten minutes of bench
 * time per unit. Four are ordered; A is on the shelf, B has to be bought.
 * The end state that must hold: components are reserved against other orders,
 * a short order cannot be completed, the finished goods enter stock at
 * material + labor (4 × 6 250 öre), component stock went down by exactly what
 * the BOM says, and what stock is worth is also what the ledger says.
 */
async function run(s: Scenario): Promise<void> {
  // ── Define ────────────────────────────────────────────────────────────────
  const a = s.idOf(await s.must('component A exists', 'manage_product', {
    action: 'create', name: `Battery bracket A ${s.tag}`, price_cents: 3_000, cost_cents: 1_000, track_inventory: true, stock_quantity: 0,
  }), 'product');
  const b = s.idOf(await s.must('component B exists with nothing in stock', 'manage_product', {
    action: 'create', name: `Battery bolt B ${s.tag}`, price_cents: 2_000, cost_cents: 500, track_inventory: true, stock_quantity: 0,
  }), 'product');
  const f = s.idOf(await s.must('the finished good exists with nothing in stock', 'manage_product', {
    action: 'create', name: `Battery lamp F ${s.tag}`, price_cents: 20_000, track_inventory: true, stock_quantity: 0,
  }), 'product');

  const vendor = s.idOf(await s.must('a vendor exists', 'manage_vendor', { action: 'create', name: `Battery Bult AB ${s.tag}` }), 'vendor');
  await buy(s, vendor, a, 10, 1_000, 'ten A are bought and received @ 10 kr');
  s.equal('ten A are on the shelf', await onHand(s, a), 10);

  await s.mustRefuse('a BOM without components is refused', 'manage_bom', { product_id: f, lines: [] }, /at least one component|lines/i);
  const bom = await s.must('the BOM says 2 × A + 1 × B per unit', 'manage_bom', {
    product_id: f, lines: [{ component_product_id: a, quantity: 2 }, { component_product_id: b, quantity: 1 }],
  });
  const bomId = String(bom.bom_id);

  const wc = await s.must('a work center at 300 kr/h', 'manage_work_center', {
    p_action: 'create', p_code: `WC-${s.tag}`, p_name: `Battery bench ${s.tag}`, p_cost_per_hour_cents: 30_000,
  });
  const wcId = String(wc.id ?? wc.work_center_id ?? (wc.work_center as { id?: string } | undefined)?.id ?? '');
  s.check('the work center answers with its id', /^[0-9a-f-]{36}$/.test(wcId), JSON.stringify(wc).slice(0, 200));
  await s.must('one routing operation: 10 minutes per unit', 'manage_routing_operation', {
    p_action: 'create', p_bom_id: bomId, p_sequence: 10, p_name: 'Assemble', p_work_center_id: wcId, p_duration_minutes: 10,
  });

  // ── Order ─────────────────────────────────────────────────────────────────
  const mo = await s.must('an MO for four is created', 'create_manufacturing_order', { product_id: f, quantity: 4, source_type: 'agent' });
  const moId = s.idOf(mo, 'manufacturing_order');
  const moRow = await s.one<{ mo_number: string; status: string }>('select mo_number, status from manufacturing_orders where id = $1', [moId]);
  s.check('the MO number is generated', /\d/.test(moRow?.mo_number ?? ''), `got "${moRow?.mo_number}"`);
  s.equal('a new MO is a draft', moRow?.status, 'draft');

  await s.mustRefuse('a draft MO cannot be started', 'start_manufacturing_order', { mo_id: moId }, /confirmed before starting/i);

  const confirmed = await s.must('confirming snapshots the BOM and reports B short', 'confirm_manufacturing_order', { mo_id: moId });
  const shortages = (confirmed.shortages ?? []) as Array<{ component_product_id: string; qty_short: number }>;
  s.check('exactly B is short, by four', shortages.length === 1 && shortages[0].component_product_id === b && Number(shortages[0].qty_short) === 4,
    JSON.stringify(shortages));
  const snap = await s.sql<{ component_product_id: string; qty_required: string }>(
    'select component_product_id, qty_required from mo_components where mo_id = $1', [moId]);
  s.equal('the snapshot asks for 8 × A', Number(snap.find((r) => r.component_product_id === a)?.qty_required), 8);
  s.equal('the snapshot asks for 4 × B', Number(snap.find((r) => r.component_product_id === b)?.qty_required), 4);
  s.equal('eight A are reserved for the MO', await reserved(s, moId, a), 8);

  // ── One stock model: another order sees what this one holds ───────────────
  const mo2 = s.idOf(await s.must('a second MO for one unit', 'create_manufacturing_order', { product_id: f, quantity: 1 }), 'manufacturing_order');
  await s.must('the second MO takes the last two A', 'confirm_manufacturing_order', { mo_id: mo2 });
  s.equal('two A are reserved for the second MO', await reserved(s, mo2, a), 2);
  const mo3 = s.idOf(await s.must('a third MO for one unit', 'create_manufacturing_order', { product_id: f, quantity: 1 }), 'manufacturing_order');
  const third = await s.must('the third MO is confirmed', 'confirm_manufacturing_order', { mo_id: mo3 });
  s.check('the third MO finds no free A — ten on hand, ten held by others',
    ((third.shortages ?? []) as Array<{ component_product_id: string; qty_short: number }>).some((x) => x.component_product_id === a && Number(x.qty_short) === 2),
    JSON.stringify(third.shortages));
  const cancelled = await s.must('the second MO is cancelled', 'cancel_manufacturing_order', { mo_id: mo2, reason: 'process battery' });
  s.equal('cancelling releases its one reservation', cancelled.reservations_released, 1);
  const recheck = await s.must('the third MO looks again', 'check_mo_availability', { mo_id: mo3 });
  s.check('the released A are free for the third MO',
    !((recheck.shortages ?? []) as Array<{ component_product_id: string }>).some((x) => x.component_product_id === a), JSON.stringify(recheck.shortages));
  await s.must('the third MO is cancelled too', 'cancel_manufacturing_order', { mo_id: mo3, reason: 'process battery' });

  // ── Procure the shortage ──────────────────────────────────────────────────
  const proc = await s.must('procurement is triggered for the MO', 'trigger_procurement_for_mo', { mo_id: moId });
  const requests = (proc.requests ?? []) as Array<{ component_product_id: string; qty_short: number }>;
  s.check('it asks for four B and nothing else', requests.length === 1 && requests[0].component_product_id === b && Number(requests[0].qty_short) === 4,
    JSON.stringify(proc).slice(0, 300));
  const po = await s.must('a PO for 4 × B @ 5 kr carries the MO as its source', 'create_purchase_order', {
    vendor_id: vendor, source_type: 'manufacturing', source_id: moId,
    lines: [{ product_id: b, description: 'Bolt B', quantity: 4, unit_price_cents: 500, tax_rate: 25 }],
  });
  const poId = s.idOf(po, 'purchase_order');
  const poRow = await s.one<{ source_type: string; source_id: string; total_cents: number }>(
    'select source_type, source_id, total_cents from purchase_orders where id = $1', [poId]);
  s.check('the PO points back at the MO', poRow?.source_type === 'manufacturing' && poRow?.source_id === moId, JSON.stringify(poRow));
  s.equal('the PO total is 4 × 5 kr + 25 % VAT', poRow?.total_cents, 2_500);
  const again = await s.must('procurement is triggered a second time', 'trigger_procurement_for_mo', { mo_id: moId });
  s.check('the open PO covers it — nothing is asked twice',
    ((again.requests ?? []) as unknown[]).length === 0 && Number(again.skipped_existing) === 1, JSON.stringify(again).slice(0, 300));

  // ── Execute ───────────────────────────────────────────────────────────────
  const wos = await s.must('work orders are generated', 'generate_mo_work_orders', { p_mo_id: moId });
  s.equal('one work order, 40 planned minutes', `${wos.work_orders_created}/${Number(wos.total_planned_minutes)}`, '1/40');
  s.equal('planned labor is 40 min × 300 kr/h = 200 kr', wos.total_planned_labor_cost_cents, 20_000);
  await s.must('the MO is started', 'start_manufacturing_order', { mo_id: moId });
  await s.mustRefuse('completing with an open work order is refused', 'complete_manufacturing_order', { mo_id: moId }, /work order\(s\) still open/i);
  const wo = await s.one<{ id: string }>('select id from mo_work_orders where mo_id = $1', [moId]);
  const done = await s.must('the work order is done in 30 minutes', 'progress_work_order', { p_work_order_id: wo!.id, p_action: 'done', p_actual_minutes: 30 });
  s.equal('actual labor is 30 min × 300 kr/h = 150 kr', done.actual_labor_cost_cents, 15_000);
  await s.mustRefuse('completing while B is still short is refused', 'complete_manufacturing_order', { mo_id: moId }, /short/i);
  s.equal('the refused completion consumed nothing', await onHand(s, a), 10);

  await s.must('the PO is sent', 'send_purchase_order', { purchase_order_id: poId });
  const line = await s.one<{ id: string }>('select id from purchase_order_lines where purchase_order_id = $1', [poId]);
  await s.must('four B are received', 'receive_purchase_order', { purchase_order_id: poId, lines: [{ po_line_id: line!.id, quantity_received: 4 }] });
  s.equal('four B are on the shelf', await onHand(s, b), 4);
  await s.booksBalance('the goods receipt reaches the books, balanced',
    `e.source = 'inventory_receipt' and e.reference_number in (select id::text from goods_receipts where purchase_order_id = $1)`, [poId]);

  const avail = await s.must('availability is checked again', 'check_mo_availability', { mo_id: moId });
  s.equal('nothing is short any more', avail.overall, 'ok');
  await s.must('the MO is confirmed again now that B arrived', 'confirm_manufacturing_order', { mo_id: moId });
  // FINDING 2026-09-19: the B bought FOR this MO is never reserved for it — confirm_mo on a confirmed MO
  // only re-reads availability, so another order confirmed after the receipt can take the four B.
  s.equal('the B bought for this MO are reserved for it', await reserved(s, moId, b), 4);

  const completed = await s.must('the MO is completed', 'complete_manufacturing_order', { mo_id: moId });
  s.equal('material is 8 × 10 kr + 4 × 5 kr = 100 kr', completed.material_cost_cents, 10_000);
  s.equal('labor is the 150 kr actually worked', completed.labor_cost_cents, 15_000);
  s.equal('unit cost is (100 + 150) / 4 = 62.50 kr', completed.unit_cost_cents, 6_250);

  // ── End state ─────────────────────────────────────────────────────────────
  s.equal('the MO is done', (await s.one<{ status: string }>('select status from manufacturing_orders where id = $1', [moId]))?.status, 'done');
  s.equal('two A are left', await onHand(s, a), 2);
  s.equal('no B is left', await onHand(s, b), 0);
  s.equal('four finished goods are on the shelf', await onHand(s, f), 4);
  const mirror = await s.sql<{ id: string; stock_quantity: number }>('select id, stock_quantity from products where id = any($1)', [[a, b, f]]);
  const m = (id: string) => mirror.find((r) => r.id === id)?.stock_quantity;
  s.equal('the product mirror agrees with the quants (A/B/F)', `${m(a)}/${m(b)}/${m(f)}`, '2/0/4');
  const held = await s.one<{ qty: string }>(
    `select coalesce(sum(reserved_quantity), 0) as qty from stock_quants where product_id = any($1)`, [[a, b]]);
  s.equal('no component is left reserved', Number(held?.qty), 0);
  const resStates = await s.sql<{ state: string }>(
    `select distinct state from stock_reservations where reference_type = 'manufacturing_order' and reference_id = $1`, [moId]);
  s.equal('the MO\'s reservations turned into consumption', resStates.map((r) => r.state).join(','), 'consumed');
  const moves = await s.sql<{ move_type: string; product_id: string; qty: string; value: string }>(
    `select move_type, product_id, sum(quantity) as qty, sum(value_cents) as value from stock_moves where mo_id = $1 group by 1, 2`, [moId]);
  const mv = (type: string, id: string) => moves.find((r) => r.move_type === type && r.product_id === id);
  s.equal('consumption moves: −8 A worth 80 kr', `${mv('mo_consumption', a)?.qty}/${mv('mo_consumption', a)?.value}`, '-8/8000');
  s.equal('consumption moves: −4 B worth 20 kr', `${mv('mo_consumption', b)?.qty}/${mv('mo_consumption', b)?.value}`, '-4/2000');
  s.equal('production move: +4 F worth 250 kr', `${mv('mo_production', f)?.qty}/${mv('mo_production', f)?.value}`, '4/25000');
  const layer = await s.one<{ quantity: string; unit_cost_cents: string; value_cents: string }>(
    `select quantity, unit_cost_cents, value_cents from stock_valuation_layers where product_id = $1`, [f]);
  s.equal('one valuation layer: 4 @ 62.50 kr = 250 kr', `${Number(layer?.quantity)}/${layer?.unit_cost_cents}/${layer?.value_cents}`, '4/6250/25000');

  // Material moves inventory → inventory (no entry needed), but 150 kr of labor was ADDED to what
  // stock is worth. The ledger has to carry it too, or inventory_gl_reconciliation drifts by it.
  // FINDING 2026-09-19: complete_mo capitalises labor in the valuation layer and posts nothing to the ledger.
  const labor = await s.one<{ cents: string }>(
    `select coalesce(sum(l.debit_cents), 0) as cents
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where l.account_code = public.account_for('inventory')
        and (e.reference_number in ($1, $2) or e.description ilike '%' || $2 || '%')`, [moId, moRow?.mo_number ?? '∅']);
  s.equal('the capitalised labor (150 kr) is debited to inventory in the ledger', labor?.cents, 15_000);

  const twice = await s.must('completing a done MO again is a no-op', 'complete_manufacturing_order', { mo_id: moId });
  s.check('it says already done', /already done/.test(String(twice.note ?? '')), JSON.stringify(twice));
  s.equal('and produced nothing more', await onHand(s, f), 4);
  await s.mustRefuse('work orders of a done MO are not regenerated', 'generate_mo_work_orders', { p_mo_id: moId }, /not regenerated/i);
  await s.mustRefuse('no more work can be booked on a done MO', 'progress_work_order', { p_work_order_id: wo!.id, p_action: 'start' }, /no more work/i);

  // ── A component born stocked through manage_product ───────────────────────
  // FINDING 2026-09-19: manage_product create with stock_quantity writes only products.stock_quantity —
  // no quant, no move, no cost layer. check_mo_availability falls back to the mirror and says "ok",
  // reserve_stock then fails inside confirm_mo's swallowed EXCEPTION, so nothing is held and every
  // other MO is promised the same five; completing drives the quant to −5 while the mirror says 0.
  const c = s.idOf(await s.must('component C is born with five in stock', 'manage_product', {
    action: 'create', name: `Battery cap C ${s.tag}`, price_cents: 1_500, cost_cents: 300, track_inventory: true, stock_quantity: 5,
  }), 'product');
  const g = s.idOf(await s.must('a second finished good G', 'manage_product', {
    action: 'create', name: `Battery jar G ${s.tag}`, price_cents: 9_000, track_inventory: true, stock_quantity: 0,
  }), 'product');
  await s.must('G is made of one C', 'manage_bom', { product_id: g, lines: [{ component_product_id: c, quantity: 1 }] });
  const mo4 = s.idOf(await s.must('an MO for five G', 'create_manufacturing_order', { product_id: g, quantity: 5 }), 'manufacturing_order');
  const c4 = await s.must('it is confirmed — C reads as available', 'confirm_manufacturing_order', { mo_id: mo4 });
  s.equal('no shortage is reported for C', ((c4.shortages ?? []) as unknown[]).length, 0);
  s.equal('the five C it was promised are reserved for it', await reserved(s, mo4, c), 5);
  s.equal('the five C exist in the warehouse quants', await onHand(s, c), 5);
  await s.must('the MO for G is cancelled', 'cancel_manufacturing_order', { mo_id: mo4, reason: 'process battery' });

  // ── The operation says what came out: a quality check and scrap ───────────
  const inspected = await s.must('the assembly operation is made to require a torque test', 'manage_routing_operation', {
    p_action: 'create', p_bom_id: bomId, p_sequence: 20, p_name: 'Torque', p_work_center_id: wcId, p_duration_minutes: 5,
    p_requires_inspection: true, p_inspection_name: 'Torque test',
  });
  s.check('the operation carries its inspection', ((await s.must('the routing is read back', 'manage_routing_operation', { p_action: 'list', p_bom_id: bomId })).operations as Array<{ id: string; requires_inspection: boolean; inspection_name: string }>)
    .some((o) => o.id === inspected.operation_id && o.requires_inspection && o.inspection_name === 'Torque test'), JSON.stringify(inspected));

  await buy(s, vendor, a, 20, 1_000, 'twenty more A are bought and received');
  await buy(s, vendor, b, 10, 500, 'ten more B are bought and received');
  const mo5 = s.idOf(await s.must('a fifth MO for ten', 'create_manufacturing_order', { product_id: f, quantity: 10 }), 'manufacturing_order');
  await s.must('it is confirmed', 'confirm_manufacturing_order', { mo_id: mo5 });
  await s.must('its work orders are generated', 'generate_mo_work_orders', { p_mo_id: mo5 });
  await s.must('it is started', 'start_manufacturing_order', { mo_id: mo5 });
  const ops = await s.sql<{ id: string; name: string }>('select id, name from mo_work_orders where mo_id = $1 order by sequence', [mo5]);
  const assemble = ops.find((o) => o.name === 'Assemble')!;
  const torque = ops.find((o) => o.name === 'Torque')!;

  await s.must('the assembly is finished — it needs no check', 'progress_work_order', { p_work_order_id: assemble.id, p_action: 'done', p_actual_minutes: 60 });
  await s.mustRefuse('the torque operation cannot be finished before it is checked', 'progress_work_order',
    { p_work_order_id: torque.id, p_action: 'done' }, /quality check|Torque test/i);
  const state = await s.must('the inspection state is readable', 'work_order_inspection_state', { p_work_order_id: torque.id });
  s.equal('it says a check is required', state.requires_inspection, true);
  s.equal('and that none has passed', state.passed, false);
  await s.must('the first check fails at 82 Nm', 'record_quality_check', { p_work_order_id: torque.id, p_result: 'fail', p_measured_value: '82 Nm', p_note: 'below spec' });
  await s.mustRefuse('a failed check still holds the operation', 'progress_work_order', { p_work_order_id: torque.id, p_action: 'done' }, /last check failed/i);

  const scrapped = await s.must('two units crack at the torque station', 'record_operation_scrap', { p_work_order_id: torque.id, p_qty: 2, p_reason: 'cracked housing' });
  s.equal('eight can still be finished', Number(scrapped.good_quantity_left), 8);
  await s.mustRefuse('more cannot be scrapped than the order holds', 'record_operation_scrap', { p_work_order_id: torque.id, p_qty: 9 }, /exceed the order/i);
  await s.must('the rework passes at 95 Nm', 'record_quality_check', { p_work_order_id: torque.id, p_result: 'pass', p_measured_value: '95 Nm', p_note: 'reworked' });
  await s.must('the torque operation is finished', 'progress_work_order', { p_work_order_id: torque.id, p_action: 'done', p_actual_minutes: 20 });
  const checks = await s.one<{ n: string }>('select count(*) as n from mo_quality_checks where work_order_id = $1', [torque.id]);
  s.equal('both checks are on record', checks?.n, 2);
  let rewritten = true;
  try { await s.sql(`update mo_quality_checks set result = 'pass' where work_order_id = $1 and result = 'fail'`, [torque.id]); } catch { rewritten = false; }
  s.check('a recorded check cannot be rewritten', !rewritten);

  await s.mustRefuse('more than what survived cannot be produced', 'complete_manufacturing_order', { mo_id: mo5, actual_qty: 10 }, /scrapped|at most/i);
  const fifth = await s.must('the MO is completed', 'complete_manufacturing_order', { mo_id: mo5 });
  s.equal('eight good units came out of ten started', Number(fifth.qty_produced), 8);
  s.equal('two were scrapped', Number(fifth.qty_scrapped), 2);
  s.equal('the answer says the survivors carry the scrap', fifth.unit_cost_includes_scrap, true);
  // Ten units of material were consumed (2×A + 1×B each); eight units carry it.
  s.equal('material for ten was consumed', Number(fifth.material_cost_cents), 25_000);
  s.equal('the unit cost carries the scrapped units', Number(fifth.unit_cost_cents),
    Math.round((Number(fifth.material_cost_cents) + Number(fifth.labor_cost_cents)) / 8));
  s.equal('eight more finished goods are on the shelf', await onHand(s, f), 12);
  await s.mustRefuse('a done MO takes no more scrap', 'record_operation_scrap', { p_work_order_id: torque.id, p_qty: 1 }, /is done/i);

  // ── A machine that is down takes no work ─────────────────────────────────
  const press = await s.must('the bench gets a press on it', 'manage_equipment', {
    p_action: 'create', p_name: `Battery press ${s.tag}`, p_category: 'machine', p_work_center_id: wcId,
  });
  const pressId = String(press.equipment_id);
  const mo6 = s.idOf(await s.must('a sixth MO for one', 'create_manufacturing_order', { product_id: f, quantity: 1 }), 'manufacturing_order');
  await s.must('it is confirmed', 'confirm_manufacturing_order', { mo_id: mo6 });
  await s.must('its work orders are generated', 'generate_mo_work_orders', { p_mo_id: mo6 });
  await s.must('it is started', 'start_manufacturing_order', { mo_id: mo6 });
  const sixthOps = await s.sql<{ id: string; name: string }>('select id, name from mo_work_orders where mo_id = $1 order by sequence', [mo6]);
  const sixthAssemble = sixthOps.find((o) => o.name === 'Assemble')!;

  const free = await s.must('the work center is read before anything breaks', 'work_center_availability', { p_work_center_id: wcId });
  s.equal('a work center with a working machine is available', free.available, true);
  const broke = await s.must('the press breaks — a critical request', 'manage_maintenance_request', {
    p_action: 'create', p_equipment_id: pressId, p_title: `Battery ram ${s.tag}`, p_kind: 'corrective', p_priority: 'critical',
  });
  s.equal('a critical request says it takes the machine down', broke.blocks_equipment, true);
  s.equal('the machine is under maintenance', broke.equipment_status, 'under_maintenance');
  const blocked = await s.must('the work center is read again', 'work_center_availability', { p_work_center_id: wcId });
  s.equal('the work center is no longer available', blocked.available, false);
  s.check('it names the machine and the open request',
    ((blocked.down ?? []) as Array<{ equipment: string; open_request: { title: string } | null }>)
      .some((d) => d.equipment === `Battery press ${s.tag}` && d.open_request?.title === `Battery ram ${s.tag}`), JSON.stringify(blocked.down));
  await s.mustRefuse('no work starts on a machine that is down', 'progress_work_order',
    { p_work_order_id: sixthAssemble.id, p_action: 'start' }, /cannot start|under maintenance/i);

  const repaired = await s.must('the press is repaired in 90 minutes', 'manage_maintenance_request', {
    p_action: 'update', p_request_id: broke.request_id, p_status: 'done', p_duration_minutes: 90,
  });
  s.equal('closing the last blocking request brings the machine back', repaired.equipment_status, 'operational');
  await s.must('a preventive job is booked — it does not stop the machine', 'manage_maintenance_request', {
    p_action: 'create', p_equipment_id: pressId, p_title: `Battery grease ${s.tag}`, p_kind: 'preventive', p_priority: 'low',
  });
  s.equal('the machine is still operational', (await s.one<{ status: string }>('select status from equipment where id = $1', [pressId]))?.status, 'operational');
  await s.must('the work starts now', 'progress_work_order', { p_work_order_id: sixthAssemble.id, p_action: 'start' });
  await s.must('the MO is cancelled — it was only about the machine', 'cancel_manufacturing_order', { mo_id: mo6, reason: 'process battery' });

  const stats = await s.must('the press has reliability figures', 'maintenance_stats', { p_equipment_id: pressId });
  const row = ((stats.equipment ?? []) as Array<Record<string, unknown>>)[0] ?? {};
  s.equal('one failure is on record', Number(row.failures), 1);
  s.equal('the figures name the work center the machine feeds', row.work_center, `Battery bench ${s.tag}`);
  s.check('one failure is no mean between failures', row.mtbf_hours === null && typeof row.mtbf_note === 'string', JSON.stringify(row));
  s.check('but the time to restore is known', Number(row.mttr_hours) >= 0 && row.mttr_hours !== null, JSON.stringify(row));

  // ── Plan: the reorder rule sees the finished good below its minimum ───────
  await s.must('a manufacture reorder rule: keep ten F', 'manage_reorder_rule', {
    p_action: 'set', p_product: f, p_min_qty: 10, p_max_qty: 12, p_procurement_method: 'manufacture',
  });
  const mrp = await s.must('the MRP run is rehearsed (dry run)', 'mrp_reorder_run', { p_dry_run: true });
  const cand = ((mrp.candidates ?? []) as Array<{ product_id: string; suggested_qty: number; quantity_on_hand: number }>).find((c) => c.product_id === f);
  s.check('twelve F on hand is above the minimum of ten — nothing is proposed', cand === undefined, JSON.stringify(cand));
  s.equal('a dry run creates no MO', (await s.one<{ n: string }>(
    `select count(*) as n from manufacturing_orders where product_id = $1 and status not in ('done', 'cancelled')`, [f]))?.n, 0);
}

/** Buy and receive through the purchasing skills — the only way stock is born with a quant AND a cost layer. */
async function buy(s: Scenario, vendorId: string, productId: string, qty: number, unitPriceCents: number, step: string): Promise<string> {
  const po = s.idOf(await s.must(`${step} — PO`, 'create_purchase_order', {
    vendor_id: vendorId, lines: [{ product_id: productId, description: step, quantity: qty, unit_price_cents: unitPriceCents, tax_rate: 25 }],
  }), 'purchase_order');
  await s.must(`${step} — sent`, 'send_purchase_order', { purchase_order_id: po });
  const line = await s.one<{ id: string }>('select id from purchase_order_lines where purchase_order_id = $1', [po]);
  await s.must(`${step} — received`, 'receive_purchase_order', { purchase_order_id: po, lines: [{ po_line_id: line!.id, quantity_received: qty }] });
  return po;
}

async function onHand(s: Scenario, productId: string): Promise<number> {
  const row = await s.one<{ qty: string }>(
    `select coalesce(sum(q.quantity), 0) as qty from stock_quants q
       join stock_locations l on l.id = q.location_id
      where q.product_id = $1 and l.location_type = 'internal'`, [productId]);
  return Number(row?.qty ?? 0);
}

async function reserved(s: Scenario, moId: string, productId: string): Promise<number> {
  const row = await s.one<{ qty: string }>(
    `select coalesce(sum(quantity), 0) as qty from stock_reservations
      where reference_type = 'manufacturing_order' and reference_id = $1 and product_id = $2 and state = 'reserved'`, [moId, productId]);
  return Number(row?.qty ?? 0);
}

export default { process: 'plan-to-produce', run } satisfies ScenarioModule;
