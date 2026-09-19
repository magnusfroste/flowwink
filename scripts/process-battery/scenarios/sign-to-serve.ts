import { createHash } from 'node:crypto';
import type { Scenario, ScenarioModule } from '../lib';

/**
 * Sign-to-Serve: a 24-month service agreement at 10 000 kr a month with one
 * appendix is drafted from a template, sent for signature and signed by the
 * customer on the public token endpoint. A second agreement is declined.
 * The end state that must hold: the signature's content hash covers body AND
 * appendix and still verifies afterwards (a signed agreement cannot be changed),
 * exactly one service is born from the signature (provider = contract, 24
 * months, 10 000 kr), the contract bills it (12 500 kr incl. VAT, once per
 * period) and the subscription biller refuses it, and a declined agreement
 * gives birth to nothing.
 */
const FN_URL = (process.env.BATTERY_FN_URL ?? 'http://127.0.0.1:54321/functions/v1').replace(/\/$/, '');

async function run(s: Scenario): Promise<void> {
  const customerEmail = `fiber-${s.tag}@example.test`;
  const customerName = `Battery Fiber AB ${s.tag}`;

  // ── Template ──────────────────────────────────────────────────────────────
  await s.mustRefuse('a template without a body is refused', 'manage_contract_template',
    { action: 'create', name: `Battery tom mall ${s.tag}`, body_markdown: '' }, /body|empty|required/i);
  const body = [
    '**Avtalsnummer:** {{contract.number}} · **Upprättat:** {{today}}',
    '**Leverantör:** {{supplier.name}} · **Kund:** {{counterparty.name}} ({{counterparty.email}})',
    '## §1 Tjänsten', 'Leverantören levererar fiberanslutning enligt Bilaga 1 till Kunden under avtalstiden.',
    '## §4 Avtalade rader', '{{quote.lines}}',
    '## §5 Avtalstid', 'Avtalet gäller från {{start_date}} till {{end_date}}. Avtalets totala värde är {{value}} {{currency}}.',
    '## §6 Betalning', 'Tjänsten faktureras månadsvis i förskott med 30 dagars betalningsvillkor.',
  ].join('\n\n');
  const tpl = await s.must('the organisation authors its service agreement template', 'manage_contract_template', {
    action: 'create', name: `Battery serviceavtal ${s.tag}`, description: 'process battery', contract_type: 'service', language: 'sv', body_markdown: body,
  });
  const templateId = s.idOf(tpl, 'template');
  s.check('every token in the template is one the renderer knows', ((tpl.unrendered_tokens ?? []) as unknown[]).length === 0, JSON.stringify(tpl.unrendered_tokens));
  const listed = await s.must('the template is discoverable', 'list_contract_templates', { contract_type: 'service' });
  s.check('list_contract_templates returns it', JSON.stringify(listed).includes(templateId), JSON.stringify(listed).slice(0, 200));

  // ── Quote → contract ──────────────────────────────────────────────────────
  const quote = await s.must('a quote carries the agreed line', 'manage_quote', {
    action: 'create', customer_name: customerName, customer_email: customerEmail, title: `Fiber ${s.tag}`,
    items: [{ description: `Fiber 1000/1000 ${s.tag}`, quantity: 1, unit_price_cents: 1_000_000, tax_rate_pct: 25 }],
  });
  const quoteId = s.idOf(quote, 'quote');

  await s.mustRefuse('an agreement with no text is refused', 'manage_contract',
    { action: 'create', counterparty_name: customerName, title: `Battery tomt ${s.tag}` }, /empty contract|template_id|body/i);
  const created = await s.must('the agreement is drafted from the template and the quote', 'manage_contract', {
    action: 'create', template_id: templateId, quote_id: quoteId, counterparty_name: customerName, counterparty_email: customerEmail,
    title: `Fiberavtal ${s.tag}`, start_date: '2026-10-01', end_date: '2028-10-01', value_cents: 24_000_000, currency: 'SEK',
  });
  const contractId = s.idOf(created, 'contract');
  const draft = await s.one<{ contract_number: string; status: string; body_markdown: string; quote_id: string | null; value_cents: string }>(
    'select contract_number, status, body_markdown, quote_id, value_cents from contracts where id = $1', [contractId]);
  s.check('it is a numbered draft (AGR-…)', /^AGR-/.test(draft?.contract_number ?? '') && draft?.status === 'draft', JSON.stringify({ n: draft?.contract_number, s: draft?.status }));
  s.check('the body names the customer, its own number and the term — no token survives',
    !!draft && draft.body_markdown.includes(customerName) && draft.body_markdown.includes(draft.contract_number)
      && draft.body_markdown.includes('2026-10-01') && !/\{\{(?!quote\.lines)/.test(draft.body_markdown), draft?.body_markdown.slice(0, 400));
  // FINDING 2026-09-19: create_contract_from_template reads p_overrides.quote_id, but manage_contract neither declares
  // quote_id nor forwards it (only title/start/end/value/currency) — an agent cannot draft "from the quote": no link, no §4 lines.
  s.check('the agreement is linked to its quote and §4 carries the quoted line',
    draft?.quote_id === quoteId && (draft?.body_markdown ?? '').includes(`Fiber 1000/1000 ${s.tag}`), `quote_id=${draft?.quote_id}; §4: ${(draft?.body_markdown ?? '').match(/§4[\s\S]{0,120}/)?.[0]}`);

  await s.must('the recurring fee is seeded: 10 000 kr a month, 25 % VAT, billing on', 'manage_contract', {
    action: 'update', contract_id: contractId, billing_enabled: true, billing_amount_cents: 1_000_000, billing_interval: 'month',
    billing_interval_count: 1, billing_next_date: '2026-09-01', billing_tax_rate: 0.25, billing_due_in_days: 30,
  });

  // ── Appendix: part of the agreement ───────────────────────────────────────
  await s.mustRefuse('an appendix without content is refused', 'manage_contract_appendix',
    { action: 'create', contract_id: contractId, label: 'Bilaga 1', title: 'Tom' }, /needs content/i);
  const appendix = await s.must('Bilaga 1 — the service description — is attached', 'manage_contract_appendix', {
    action: 'create', contract_id: contractId, label: 'Bilaga 1', title: 'Tjänstebeskrivning',
    body_markdown: 'Fiberanslutning 1000/1000 Mbit/s, tillgänglighet 99,9 % per kalendermånad.',
  });
  const appendixId = s.idOf(appendix, 'appendix');
  s.equal('the agreement has one appendix, labelled as the body calls it',
    (await s.sql<{ label: string }>('select label from contract_documents where contract_id = $1', [contractId])).map((r) => r.label).join(), 'Bilaga 1');

  await s.mustRefuse('an unsigned agreement cannot be invoiced', 'generate_contract_invoice', { contract_id: contractId }, /not active/i);

  // ── Send ──────────────────────────────────────────────────────────────────
  let sent = await s.skill('send_contract_for_signature', { contract_id: contractId });
  if (!sent.ok && /Public Site URL is not configured/i.test(sent.error)) {
    // FINDING 2026-09-19: the skill flips the contract to pending_signature and stores the token FIRST, and only then
    // discovers it cannot build the link — the operator is told it failed, the agreement says it was sent.
    s.equal('a send that fails leaves the agreement a draft',
      (await s.one<{ status: string }>('select status from contracts where id = $1', [contractId]))?.status, 'draft');
    // A fresh install has no site_settings.general row at all; the operator sets the public URL and sends again.
    const general = await s.skill('manage_site_settings', { action: 'get', key: 'general' });
    const current = ((general.data.value ?? (general.data.item as { value?: unknown } | undefined)?.value ?? {}) as Record<string, unknown>);
    await s.must('the operator sets the Public Site URL', 'manage_site_settings', { action: 'update', key: 'general', value: { ...current, siteUrl: 'http://localhost:5173' } });
    sent = await s.skill('send_contract_for_signature', { contract_id: contractId });
  } else {
    s.skip('a send that fails leaves the agreement a draft', 'the Public Site URL is already configured on this stack — the half-done send only reproduces on a virgin install');
  }
  s.check('send_contract_for_signature answers with the signing link', sent.ok && /\/contract\/[0-9a-f]{48}$/.test(String(sent.data.url ?? '')), sent.error || JSON.stringify(sent.data).slice(0, 200));
  const afterSend = await s.one<{ status: string; accept_token: string | null }>('select status, accept_token from contracts where id = $1', [contractId]);
  s.equal('the agreement awaits signature', afterSend?.status, 'pending_signature');
  const token = String(afterSend?.accept_token ?? '');
  s.skip('the signing link is e-mailed (comms-send → contract_email)', 'no e-mail provider locally');

  // ── Sign ──────────────────────────────────────────────────────────────────
  const wrong = await sign({ accept_token: `${'0'.repeat(47)}1`, action: 'accept', signer_name: 'Nobody', signer_email: customerEmail });
  s.equal('an unknown token signs nothing', wrong.status, 404);
  const expectedHash = await contentHash(s, contractId);
  const signed = await sign({ accept_token: token, action: 'accept', signer_name: 'Frida Fiber', signer_email: customerEmail });
  s.check('the customer signs on the public token endpoint', signed.status === 200, JSON.stringify(signed));
  const twice = await sign({ accept_token: token, action: 'accept', signer_name: 'Frida Fiber', signer_email: customerEmail });
  s.equal('a second signature on the same agreement is refused', twice.status, 409);

  const active = await s.one<{ status: string; signed_at: string | null; signer_email: string }>('select status, signed_at::text, signer_email from contracts where id = $1', [contractId]);
  s.check('the agreement is active, signed by the customer', active?.status === 'active' && active.signed_at != null && active.signer_email === customerEmail, JSON.stringify(active));
  const sig = await s.sql<{ action: string; content_hash: string }>('select action, content_hash from contract_signatures where contract_id = $1', [contractId]);
  s.equal('one signature is on record', sig.map((r) => r.action).join(), 'accept');
  s.equal('its content hash covers title, body, value, version AND the appendix', sig[0]?.content_hash, expectedHash);
  const frozen = await s.one<{ n: string }>(
    `select jsonb_array_length(snapshot->'appendices') as n from contract_versions where contract_id = $1 and reason = 'signed_by_counterparty'`, [contractId]);
  s.equal('the frozen version carries the appendix', frozen?.n, 1);

  // ── Service is born ───────────────────────────────────────────────────────
  const service = await s.sql<Record<string, string>>(
    `select id, provider, status::text, unit_amount_cents, billing_interval, commitment_months, commitment_start::text, commitment_end::date::text as commitment_end, customer_email
       from subscriptions where contract_id = $1`, [contractId]);
  // FINDING 2026-09-19: no service is born. subscriptions_provider_needs_reference (migration 20260901210000) rejects every
  // provider <> 'manual' without a provider_subscription_id — which is exactly what create_subscription_from_contract
  // inserts (provider = 'contract'). contract-sign logs the error and answers 200, so the customer signs and gets nothing.
  s.equal('exactly one service is born from the signature', service.length, 1);
  const svc = service[0] ?? {};
  if (svc.id) {
    s.equal('it is the contract\'s to bill: 10 000 kr a month, 24 months from 2026-10-01',
      `${svc.provider}/${svc.unit_amount_cents}/${svc.billing_interval}/${svc.commitment_months}/${svc.commitment_start}/${svc.commitment_end}`,
      'contract/1000000/month/24/2026-10-01/2028-10-01');
    s.equal('the service belongs to the customer who signed', svc.customer_email, customerEmail);
    const refire = await s.asService<{ id: string }>('select public.create_subscription_from_contract($1) as id', [contractId]);
    s.check('a double fire returns the same service', refire[0]?.id === svc.id
      && (await s.one<{ n: string }>('select count(*) as n from subscriptions where contract_id = $1', [contractId]))?.n === '1', JSON.stringify(refire));
  } else {
    for (const name of ['the service carries the contract\'s fee and term (10 000 kr/month, 24 months)', 'a double fire returns the same service',
      'a ticket is raised on the service (ticket → service → agreement)', 'the subscription biller refuses a contract-born service']) {
      s.skip(name, 'no service was born — see the failed check above');
    }
  }
  // The repair door (create_service_from_contract, 2026-09-19): idempotent on a contract that has
  // its service, and closed to a contract nobody signed.
  const repair = await s.must('the repair door finds the service already there', 'create_service_from_contract', { p_contract_id: contractId });
  s.equal('…and mints no second one', `${repair.already_existed}/${(await s.one<{ n: string }>('select count(*) as n from subscriptions where contract_id = $1', [contractId]))?.n}`, 'true/1');

  const portal = await s.one<{ users: string; roles: string }>(
    `select (select count(*) from auth.users where email = $1) as users,
            (select count(*) from user_roles r join auth.users u on u.id = r.user_id where u.email = $1 and r.role::text = 'customer') as roles`, [customerEmail]);
  s.equal('a portal account exists for the customer, with the customer role', `${portal?.users}/${portal?.roles}`, '1/1');
  s.skip('the portal invite mail is delivered', 'no e-mail provider locally');

  // ── Support on the service ────────────────────────────────────────────────
  if (svc.id) {
    const ticket = await s.must('a ticket is raised on the service', 'manage_ticket', {
      action: 'create', subject: `Fiber nere ${s.tag}`, contact_email: customerEmail, priority: 'high', subscription_id: svc.id,
    });
    const chain = await s.one<{ contract_id: string }>(
      'select sub.contract_id from tickets t join subscriptions sub on sub.id = t.subscription_id where t.id = $1', [s.idOf(ticket, 'ticket')]);
    s.equal('support sees ticket → service → agreement', chain?.contract_id, contractId);
  }

  // ── Billed by the contract, and only by the contract ──────────────────────
  const invoice = await s.must('the contract bills the first period', 'generate_contract_invoice', { contract_id: contractId });
  const inv = await s.one<Record<string, string>>(
    'select invoice_number, subtotal_cents, tax_cents, total_cents, contract_id, customer_email, status from invoices where id = $1', [String(invoice.invoice_id)]);
  s.equal('10 000 kr + 25 % VAT = 12 500 kr, on the CTR series, to the customer',
    `${inv?.subtotal_cents}/${inv?.tax_cents}/${inv?.total_cents}/${inv?.contract_id === contractId}/${inv?.customer_email}/${/^CTR-/.test(inv?.invoice_number ?? '')}`,
    `1000000/250000/1250000/true/${customerEmail}/true`);
  s.equal('the next period starts a month later',
    (await s.one<{ d: string }>('select billing_next_date::text as d from contracts where id = $1', [contractId]))?.d, '2026-10-01');
  await s.mustRefuse('the same period is not billed twice', 'generate_contract_invoice', { contract_id: contractId }, /not due until/i);
  if (svc.id) await s.mustRefuse('the subscription biller refuses a contract-born service', 'generate_subscription_invoice', { subscription_id: svc.id }, /only applies to manual/i);
  s.equal('one invoice exists for the agreement', (await s.one<{ n: string }>('select count(*) as n from invoices where contract_id = $1', [contractId]))?.n, 1);

  // ── A signed agreement cannot be changed ──────────────────────────────────
  // FINDING 2026-09-19: nothing guards a signed agreement — manage_contract update rewrites body/value on an active,
  // signed contract, manage_contract_appendix rewrites or deletes what the signature covers (the skill's own
  // instructions say "do not": that is advice to the caller, not a refusal), and the certificate's hash no longer matches.
  await s.mustRefuse('the body of a signed agreement cannot be rewritten', 'manage_contract',
    { action: 'update', contract_id: contractId, body_markdown: `${draft?.body_markdown ?? ''}\n\n## §7 Tillägg\n\nKunden betalar dubbelt.`, value_cents: 48_000_000 }, /signed|active|locked|immutable/i);
  await s.mustRefuse('an appendix of a signed agreement cannot be rewritten', 'manage_contract_appendix',
    { action: 'update', appendix_id: appendixId, body_markdown: 'Tillgänglighet 90 %.' }, /signed|active|locked|immutable/i);
  s.equal('the signed content still hashes to what the customer signed', await contentHash(s, contractId), expectedHash);
  // FINDING 2026-09-19: send_contract_for_signature has no status guard — an ACTIVE, signed agreement goes back to
  // pending_signature and can be signed a second time.
  await s.mustRefuse('a signed agreement cannot be sent for signature again', 'send_contract_for_signature', { contract_id: contractId }, /signed|active|already/i);
  const reopened = (await s.one<{ status: string }>('select status from contracts where id = $1', [contractId]))?.status;
  if (reopened !== 'active') await s.skill('manage_contract', { action: 'update', contract_id: contractId, status: 'active' }); // put it back so the rest reads a signed agreement
  await s.must('an amendment is a NEW appendix', 'manage_contract_appendix', {
    action: 'create', contract_id: contractId, label: 'Bilaga 2', title: 'Tillägg', body_markdown: 'Tillägg: en extra anslutning från 2027-01-01.',
  });

  // ── The customer who says no ──────────────────────────────────────────────
  const noEmail = `nej-${s.tag}@example.test`;
  const second = s.idOf(await s.must('a second agreement is drafted', 'manage_contract', {
    action: 'create', template_id: templateId, counterparty_name: `Battery Nej AB ${s.tag}`, counterparty_email: noEmail, start_date: '2026-10-01', end_date: '2027-10-01', value_cents: 12_000_000,
  }), 'contract');
  await s.mustRefuse('an unsigned agreement gets no service through the repair door', 'create_service_from_contract', { p_contract_id: second }, /SIGNED, active contract only/i);
  await s.skill('send_contract_for_signature', { contract_id: second });
  const secondToken = (await s.one<{ t: string }>('select accept_token as t from contracts where id = $1', [second]))?.t ?? '';
  const declined = await sign({ accept_token: secondToken, action: 'reject', signer_name: 'Nils Nej', signer_email: noEmail, comment: 'too expensive' });
  s.check('the customer declines', declined.status === 200, JSON.stringify(declined));
  const no = await s.one<{ status: string; services: string; sigs: string }>(
    `select status, (select count(*) from subscriptions where contract_id = $1) as services,
            (select string_agg(action, ',') from contract_signatures where contract_id = $1) as sigs from contracts where id = $1`, [second]);
  s.equal('a declined agreement is terminated, the refusal is on record, no service is born', `${no?.status}/${no?.sigs}/${no?.services}`, 'terminated/reject/0');
  await s.mustRefuse('a declined agreement cannot be invoiced', 'generate_contract_invoice', { contract_id: second }, /billing enabled|not active/i);
}

/** The customer on the public signing page: contract-sign is a public endpoint (verify_jwt = false), no key involved. */
async function sign(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${FN_URL}/contract-sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
    const text = await res.text();
    if ((res.status === 546 || res.status === 503 || /WORKER_LIMIT/.test(text)) && attempt < 3) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep the text */ }
    return { status: res.status, body: parsed };
  }
}

/** The hash contract-sign records, recomputed from what the database holds NOW (same fields, same order). */
async function contentHash(s: Scenario, contractId: string): Promise<string> {
  const c = await s.one<Record<string, unknown>>('select title, counterparty_name, body_markdown, value_cents, currency, version from contracts where id = $1', [contractId]);
  const appendices = await s.sql<Record<string, unknown>>(
    'select label, title, kind, body_markdown, file_url from contract_documents where contract_id = $1 and label = $2 order by sort_order', [contractId, 'Bilaga 1']);
  const payload = {
    title: c?.title, counterparty_name: c?.counterparty_name, body_markdown: c?.body_markdown ?? null,
    value_cents: Number(c?.value_cents ?? 0), currency: c?.currency, version: Number(c?.version ?? 1),
    appendices: appendices.map((a) => ({ label: a.label ?? null, title: a.title ?? null, kind: a.kind, body_markdown: a.body_markdown ?? null, file_url: a.file_url ?? null })),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export default { process: 'sign-to-serve', run } satisfies ScenarioModule;
