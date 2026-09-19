import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scenario, ScenarioModule } from '../lib';

/**
 * Content-to-Conversion: an article and a landing page are written, published,
 * withdrawn and scheduled; a knowledge-base article is published publicly and
 * internally; four people subscribe, one unsubscribes, one revokes consent, and
 * the newsletter goes out. The end state that must hold: nothing unpublished is
 * readable by an anonymous visitor (PostgREST and get-page, with the anon key);
 * publish state machines end where they say; a subscription is ONE row however
 * often and however it is spelled; and an address that said no is not in the
 * send's delivery ledger.
 *
 * Research, proposal, social and SEO-brief steps need a model and are skipped,
 * announced. The mail hop is simulated by the local stack; the delivery ledger
 * (newsletter_deliveries) is the platform-side state that is asserted.
 */
async function run(s: Scenario): Promise<void> {
  const anon = anonKey();
  if (!anon) s.skip('every anonymous-visitor check below', 'no local anon key (supabase-go status) — set BATTERY_ANON_KEY');

  // ── Precondition: the site knows who it is (write_blog_post refuses otherwise) ─
  const identity = await s.one<{ name: string | null }>(`select value->>'company_name' as name from site_settings where key = 'company_profile'`);
  if (!identity?.name?.trim()) {
    await s.must('the Business Identity is set', 'update_company_profile', {
      data: { company_name: 'Battery Consulting AB', description: 'Process battery demo company', services: [{ name: 'Rådgivning', description: 'Upphandlingsstöd' }] },
    });
  }
  s.skip('research + proposal (research_content, competitor_monitor, generate_content_proposal, seo_content_brief)', 'needs an AI provider');

  // ── Blog: draft → published → draft ──────────────────────────────────────
  await s.mustRefuse('a post without content is refused — the skill does not generate', 'write_blog_post', { title: `Utan innehåll ${s.tag}` }, /content is required/i);
  await s.mustRefuse('a placeholder title is refused', 'write_blog_post', { title: 'TBD', content: 'x' }, /placeholder/i);

  const title = `Fem fallgropar i offentlig upphandling ${s.tag}`;
  const body = `## Varför det går fel\n\nDe flesta anbud faller på formalia.\n\n- Läs skakraven\n- Svara på frågan\n\n## Nästa steg\n\nBoka en genomgång.`;
  const post = await s.must('an article is written', 'write_blog_post', { title, content: body, tone: 'professional', language: 'sv' });
  const postId = s.idOf(post, 'blog_post');
  const slug = String(post.slug);
  const born = await s.one<{ status: string; published_at: Date | null; blocks: string }>(
    `select status, published_at, jsonb_array_length(content_json->'content') as blocks from blog_posts where id = $1`, [postId]);
  s.equal('it is born a draft, unpublished, with its body stored', `${born?.status}|${born?.published_at}|${Number(born?.blocks) >= 4}`, 'draft|null|true');

  const twin = await s.must('the same title is written again', 'write_blog_post', { title, content: body });
  s.check('…and gets its own slug instead of colliding', twin.slug === `${slug}-2`, `first ${slug}, second ${String(twin.slug)}`);

  if (anon) {
    const peek = await anonGet(anon, `blog_posts?slug=eq.${slug}&select=id,title,status`);
    s.check('an anonymous visitor cannot read the draft (PostgREST)', peek.ok && peek.rows.length === 0, `${peek.detail} ${JSON.stringify(peek.rows)}`);
  }
  const hidden = await s.must('the public blog listing is browsed', 'browse_blog', { search: s.tag, limit: 10 });
  s.equal('the draft is not in the public listing', ((hidden.posts ?? []) as unknown[]).length, 0);

  // FINDING 2026-09-19: manage_blog_posts declares a `status` parameter, action=update ignores it
  // and still answers "updated" — the silent no-op class. (publish/unpublish are the working verbs.)
  const viaUpdate = await s.skill('manage_blog_posts', { action: 'update', post_id: twin.blog_post_id, status: 'published' });
  const twinStatus = await s.one<{ status: string }>('select status from blog_posts where id = $1', [twin.blog_post_id]);
  s.check('manage_blog_posts update {status} either changes the status or refuses — never a silent "updated"',
    !viaUpdate.ok || twinStatus?.status === 'published', `answered ${JSON.stringify(viaUpdate.data)} while the row is still "${twinStatus?.status}"`);

  await s.must('the article is published', 'manage_blog_posts', { action: 'publish', post_id: postId });
  const live = await s.one<{ status: string; stamped: boolean }>('select status, published_at is not null as stamped from blog_posts where id = $1', [postId]);
  s.equal('published, with a publish date', `${live?.status}|${live?.stamped}`, 'published|true');
  if (anon) {
    const peek = await anonGet(anon, `blog_posts?slug=eq.${slug}&select=id`);
    s.equal('now the visitor can read it', peek.rows.length, 1);
  }
  const shown = await s.must('the listing is browsed again', 'browse_blog', { search: s.tag, limit: 10 });
  s.equal('exactly the published article is listed', ((shown.posts ?? []) as Array<{ slug: string }>).map((p) => p.slug).join(','), slug);

  await s.must('the article is withdrawn', 'manage_blog_posts', { action: 'unpublish', slug });
  if (anon) {
    const peek = await anonGet(anon, `blog_posts?slug=eq.${slug}&select=id`);
    s.equal('a withdrawn article is unreadable again', peek.rows.length, 0);
  }
  await s.must('…and published again for the newsletter', 'manage_blog_posts', { action: 'publish', slug });

  // ── Landing page: draft → published → archived ───────────────────────────
  const page = await s.must('a landing page is composed', 'manage_page', {
    action: 'create', title: `Upphandlingsguide ${s.tag}`, show_in_menu: false,
    blocks: [
      { id: 'hero-1', type: 'hero', data: { title: `Vinn nästa upphandling ${s.tag}`, subtitle: 'En guide i fem steg' } },
      { id: 'text-1', type: 'text', data: { content: '<p>Ladda ner guiden och boka en genomgång.</p>' } },
    ],
  });
  const pageId = s.idOf(page, 'page');
  const pageSlug = String(page.slug);
  const pageRow = await s.one<{ status: string; n: string; in_menu: boolean }>(`select status, jsonb_array_length(content_json) as n, show_in_menu as in_menu from pages where id = $1`, [pageId]);
  s.equal('the page is a draft with both blocks, outside the menu', `${pageRow?.status}|${pageRow?.n}|${pageRow?.in_menu}`, 'draft|2|false');
  await s.mustRefuse('a block the renderer does not know is refused, nothing written', 'manage_page',
    { action: 'update', page_id: pageId, blocks: [{ id: 'x-1', type: 'no-such-block', data: {} }] }, /block|valid|unknown/i);
  s.equal('…the two blocks are still there', (await s.one<{ n: string }>('select jsonb_array_length(content_json) as n from pages where id = $1', [pageId]))?.n, 2);

  if (anon) {
    const rest = await anonGet(anon, `pages?slug=eq.${pageSlug}&select=id`);
    s.check('the draft page is unreadable through PostgREST', rest.ok && rest.rows.length === 0, `${rest.detail} ${JSON.stringify(rest.rows)}`);
    const edge = await anonFn(anon, `get-page?slug=${pageSlug}`);
    s.check('…and through get-page', edge.found === false, JSON.stringify(edge).slice(0, 200));
  }
  await s.must('the page is published', 'manage_page', { action: 'publish', page_id: pageId });
  const versions = await s.one<{ n: string }>('select count(*) as n from page_versions where page_id = $1', [pageId]);
  s.equal('publishing keeps a version to roll back to', versions?.n, 1);
  if (anon) {
    const rest = await anonGet(anon, `pages?slug=eq.${pageSlug}&select=id`);
    const edge = await anonFn(anon, `get-page?slug=${pageSlug}`);
    s.check('the published page is served to visitors (PostgREST + get-page)', rest.rows.length === 1 && edge.found !== false, `${rest.rows.length} row(s); get-page ${JSON.stringify(edge).slice(0, 160)}`);
  }
  const audit = await s.skill('seo_audit_page', { slug: pageSlug });
  s.check('the published page can be SEO-audited', audit.ok, audit.error);

  await s.must('the campaign ends — the page is archived', 'manage_page', { action: 'archive', page_id: pageId });
  if (anon) {
    const rest = await anonGet(anon, `pages?slug=eq.${pageSlug}&select=id`);
    s.equal('an archived page is unreadable', rest.rows.length, 0);
  }

  // ── Scheduled publishing ─────────────────────────────────────────────────
  // FINDING 2026-09-19: no skill can schedule anything — manage_page and manage_blog_posts have no
  // scheduled_at parameter; "scheduled" exists only in the admin UI. Played here as that UI.
  const due = await s.must('a page due yesterday', 'manage_page', { action: 'create', title: `Schemalagd igår ${s.tag}`, show_in_menu: false });
  const later = await s.must('a page due next month', 'manage_page', { action: 'create', title: `Schemalagd senare ${s.tag}`, show_in_menu: false });
  const dueId = s.idOf(due, 'page');
  const laterId = s.idOf(later, 'page');
  await s.asService(`update pages set status = 'reviewing', scheduled_at = now() - interval '1 day' where id = $1`, [dueId]);
  await s.asService(`update pages set status = 'reviewing', scheduled_at = now() + interval '30 days' where id = $1`, [laterId]);
  const scheduledPost = await s.must('an article due yesterday', 'write_blog_post', { title: `Schemalagd artikel ${s.tag}`, content: body });
  await s.asService(`update blog_posts set status = 'reviewing', scheduled_at = now() - interval '1 day' where id = $1`, [scheduledPost.blog_post_id]);
  s.skip('scheduling through a skill', 'no skill sets scheduled_at — played as the admin UI (finding)');

  // FINDING 2026-09-19: publish_scheduled_pages crashes as soon as ONE page is due — it writes
  // v_page.id::text (and then the slug) into audit_logs.entity_id, which is uuid: "column entity_id
  // is of type uuid but expression is of type text". The loop rolls back, so no scheduled page has
  // ever gone live through it, and the 15-minute cron fails for as long as a due page exists.
  const cycle = await s.skill('publish_scheduled_content', {});
  s.check('the scheduled-publish cycle runs with a page due', cycle.ok, cycle.error);
  if (cycle.ok) {
    const again = await s.skill('publish_scheduled_content', {});
    s.check('…and is safe to run again', again.ok, again.error);
    s.equal('the due page was published once', (await s.one<{ n: string }>(`select count(*) as n from audit_logs where action = 'scheduled_publish' and entity_id::text = $1`, [dueId]))?.n, 1);
  }
  const sched = await s.sql<{ id: string; status: string; scheduled_at: Date | null }>('select id, status, scheduled_at from pages where id = any($1::uuid[])', [[dueId, laterId]]);
  const of = (id: string) => sched.find((r) => r.id === id);
  s.equal('the due page went live and left the queue', `${of(dueId)?.status}|${of(dueId)?.scheduled_at}`, 'published|null');
  s.equal('the page due next month is still waiting', of(laterId)?.status, 'reviewing');
  // FINDING 2026-09-19: publish_scheduled_content says it publishes "pages and blog posts"; the RPC
  // (publish_scheduled_pages) only touches pages, and nothing else reads blog_posts.scheduled_at.
  s.equal('the due ARTICLE went live too ("pages and blog posts")', (await s.one<{ status: string }>('select status from blog_posts where id = $1', [scheduledPost.blog_post_id]))?.status, 'published');
  // Leave no due page behind: while the crash above exists, one would keep the shared cron failing.
  await s.asService(`update pages set scheduled_at = null where id = any($1::uuid[]) and status = 'reviewing'`, [[dueId, laterId]]);

  // ── Knowledge base: public vs internal ───────────────────────────────────
  const kbPublic = await s.must('a public KB article is drafted', 'manage_kb_article', { action: 'create', title: `Hur lämnar jag anbud ${s.tag}`, answer: 'Via upphandlingsportalen, före sista anbudsdag.', category: 'Upphandling' });
  const kbInternal = await s.must('an internal KB article is created and published', 'manage_kb_article', { action: 'create', title: `Intern prislista ${s.tag}`, answer: 'Timpris 1 450 kr, rabatt max 10 %.', category: 'Upphandling', visibility: 'internal', publish: true });
  const kbPubId = s.idOf(kbPublic, 'article');
  const kbIntId = s.idOf(kbInternal, 'article');
  if (anon) {
    const before = await anonGet(anon, `kb_articles?id=in.(${kbPubId},${kbIntId})&select=id`);
    s.check('neither the unpublished nor the internal article is readable', before.ok && before.rows.length === 0, JSON.stringify(before.rows));
  }
  await s.must('the public article is published', 'manage_kb_article', { action: 'publish', article_id: kbPubId });
  if (anon) {
    const afterPub = await anonGet(anon, `kb_articles?id=in.(${kbPubId},${kbIntId})&select=id`);
    s.equal('only the public one is readable — the published INTERNAL one stays hidden', afterPub.rows.map((r) => (r as { id: string }).id).join(','), kbPubId);
  }

  // ── Newsletter audience ──────────────────────────────────────────────────
  const sub = (n: string) => `prenumerant-${n}-${s.tag}@example.test`;
  await s.must('X subscribes', 'newsletter_subscribe', { email: sub('x'), name: 'Xerxes' });
  await s.must('X subscribes again', 'newsletter_subscribe', { email: sub('x'), name: 'Xerxes' });
  await s.must('X subscribes a third time, IN CAPITALS', 'newsletter_subscribe', { email: sub('x').toUpperCase() });
  s.equal('X is ONE subscriber row', (await s.one<{ n: string }>('select count(*) as n from newsletter_subscribers where lower(email) = $1', [sub('x')]))?.n, 1);
  await s.mustRefuse('a subscription without a real address is refused', 'newsletter_subscribe', { email: 'inte-en-adress' }, /valid email/i);
  for (const n of ['y', 'u', 'w']) await s.must(`${n.toUpperCase()} subscribes`, 'newsletter_subscribe', { email: sub(n) });
  const confirmed = await s.one<{ n: string }>(`select count(*) as n from newsletter_subscribers where email = any($1::text[]) and status = 'confirmed'`, [['x', 'y', 'u', 'w'].map(sub)]);
  if (Number(confirmed?.n) !== 4) {
    s.skip('double opt-in confirmation', `an e-mail provider is configured, so subscribers wait for a click (${confirmed?.n}/4 confirmed) — the audience checks below need confirmed rows`);
    return;
  }

  await s.must('Y unsubscribes', 'manage_newsletter_subscribers', { action: 'remove', email: sub('y') });
  await s.must('Y unsubscribes again', 'manage_newsletter_subscribers', { action: 'remove', email: sub('y') });
  const y = await s.one<{ status: string; stamped: boolean }>('select status, unsubscribed_at is not null as stamped from newsletter_subscribers where email = $1', [sub('y')]);
  s.equal('Y is unsubscribed, stamped', `${y?.status}|${y?.stamped}`, 'unsubscribed|true');
  s.equal('the unsubscribe is ONE revoked consent on record, not two', (await s.one<{ n: string }>(`select count(*) as n from contact_consents where email = $1 and consent_type = 'newsletter' and status = 'revoked'`, [sub('y')]))?.n, 1);

  // FINDING 2026-09-19: remove matches .eq('email', …) case-sensitively against a lower-cased column,
  // changes nothing, and still answers {status:'unsubscribed'}. An unsubscribe that silently fails
  // is the worst one to get wrong.
  const loud = await s.skill('manage_newsletter_subscribers', { action: 'remove', email: sub('u').toUpperCase() });
  const u = await s.one<{ status: string }>('select status from newsletter_subscribers where email = $1', [sub('u')]);
  s.check('U unsubscribes with the address in CAPITALS — and really is unsubscribed', loud.ok && u?.status === 'unsubscribed',
    `skill answered ${JSON.stringify(loud.data)}; the row is "${u?.status}"`);
  if (u?.status !== 'unsubscribed') await s.must('(U is unsubscribed with the exact spelling so the send below is honest)', 'manage_newsletter_subscribers', { action: 'remove', email: sub('u') });

  await s.must('W revokes newsletter consent (GDPR request)', 'manage_consent', { p_action: 'revoke', p_email: sub('w'), p_consent_type: 'newsletter', p_source: 'email_request', p_note: 'battery' });

  // FINDING 2026-09-19: count filters status = 'active' — a status the table's CHECK does not allow
  // (pending | confirmed | unsubscribed) — so "how many will get this?" always answers 0.
  const counted = await s.must('the audience is counted before sending', 'manage_newsletter_subscribers', { action: 'count' });
  const really = await s.one<{ n: string }>(`select count(*) as n from newsletter_subscribers where status = 'confirmed'`);
  s.check('the count is the number of confirmed subscribers', Number(counted.active_subscribers) === Number(really?.n) && Number(really?.n) >= 1,
    `skill says ${String(counted.active_subscribers)}, the table has ${really?.n} confirmed`);

  // ── Distribute ───────────────────────────────────────────────────────────
  const nl = await s.must('the newsletter is drafted from the article', 'send_newsletter', {
    subject: `Nytt på bloggen: fem fallgropar ${s.tag}`, content: `<h2>Fem fallgropar</h2><p>Läs artikeln: <a href="https://example.test/blog/${slug}">här</a>.</p>`,
  });
  const newsletterId = s.idOf(nl, 'newsletter');
  s.equal('drafting sends nothing', (await s.one<{ status: string }>('select status from newsletters where id = $1', [newsletterId]))?.status, 'draft');

  const gatesBefore = s.handshakes.length;
  const sent = await s.skill('execute_newsletter_send', { newsletter_id: newsletterId });
  // FINDING 2026-09-19: the skill's own instructions say "Requires approval … DESTRUCTIVE: cannot
  // unsend … NEVER call without explicit admin approval", but its trust_level is notify: an operator
  // mails the whole list with no gate (send_bulk_lead_email and cancel_webinar ARE trust: approve).
  s.check('mailing the whole list waits for an approval gate, as the skill says it does',
    s.handshakes.slice(gatesBefore).some((h) => h.skill === 'execute_newsletter_send'), 'execute_newsletter_send ran straight through (trust_level notify)');
  const ledger = await s.sql<{ recipient_email: string; status: string }>('select recipient_email, status from newsletter_deliveries where newsletter_id = $1', [newsletterId]);
  const got = (n: string) => ledger.some((d) => d.recipient_email === sub(n));
  if (!sent.ok && ledger.length === 0) {
    s.skip('the send itself', `the mail hop is unavailable locally: ${sent.error.slice(0, 160)}`);
  } else {
    s.check('X, a confirmed subscriber, is in the delivery ledger', got('x'), `${ledger.length} deliveries, none for X`);
    s.check('Y and U, who unsubscribed, are NOT', !got('y') && !got('u'), `Y:${got('y')} U:${got('u')}`);
    // FINDING 2026-09-19: manage_consent revoke(newsletter) is recorded but newsletter/send only reads
    // newsletter_subscribers.status — a contact whose newsletter consent is revoked is mailed anyway.
    // (send_bulk_lead_email honours the same revocation; the newsletter does not.)
    s.check('W, whose newsletter consent is revoked, is NOT mailed', !got('w'), 'W is in the delivery ledger');
    s.equal('nobody is in the ledger twice', new Set(ledger.map((d) => d.recipient_email)).size, ledger.length);
    const head = await s.one<{ status: string; sent_count: number }>('select status, sent_count from newsletters where id = $1', [newsletterId]);
    const delivered = ledger.filter((d) => d.status === 'sent').length;
    s.check('the newsletter is sent and sent_count equals the ledger', ['sent', 'partial'].includes(String(head?.status)) && Number(head?.sent_count) === delivered,
      `status ${head?.status}, sent_count ${head?.sent_count}, ledger says ${delivered} sent`);
    if (head?.status === 'sent') {
      await s.mustRefuse('a sent newsletter cannot be sent again', 'execute_newsletter_send', { newsletter_id: newsletterId }, /already sent/i);
      s.equal('…and the ledger did not grow', (await s.one<{ n: string }>('select count(*) as n from newsletter_deliveries where newsletter_id = $1', [newsletterId]))?.n, ledger.length);
    }
  }

  await s.must('Y changes their mind and subscribes again', 'newsletter_subscribe', { email: sub('y') });
  const back = await s.one<{ status: string; unsub: Date | null; n: string }>(
    `select status, unsubscribed_at as unsub, (select count(*) from newsletter_subscribers where lower(email) = $1) as n from newsletter_subscribers where email = $1`, [sub('y')]);
  s.equal('Y is back on the list — same row, unsubscribe date cleared', `${back?.status}|${back?.unsub}|${back?.n}`, 'confirmed|null|1');

  // ── Measure ──────────────────────────────────────────────────────────────
  const stats = await s.skill('analyze_analytics', { period: 'week' });
  s.check('traffic can be analysed', stats.ok, stats.error);
  const attribution = await s.skill('get_attribution_report', {});
  s.check('the attribution report runs', attribution.ok, attribution.error);
  s.skip('social_post_batch, ad_creative_generate, kb_gap_analysis narrative', 'needs an AI provider');
}

/** The LOCAL stack's anon key — what a visitor's browser holds. Never printed. */
function anonKey(): string | null {
  if (process.env.BATTERY_ANON_KEY) return process.env.BATTERY_ANON_KEY;
  const bin = process.env.SUPABASE_GO_BIN
    ?? '/opt/homebrew/Cellar/supabase/2.107.0/libexec/lib/node_modules/supabase/node_modules/@supabase/cli-darwin-arm64/bin/supabase-go';
  const cwd = process.env.BATTERY_SUPABASE_DIR ?? join(homedir(), 'Code/github/flowwink-qa');
  try {
    const env = execFileSync(bin, ['status', '-o', 'env'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = env.split('\n').find((l) => l.startsWith('ANON_KEY='));
    return line ? line.slice('ANON_KEY='.length).replace(/"/g, '').trim() : null;
  } catch { return null; }
}

const API = (process.env.BATTERY_API_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '');

async function anonGet(key: string, path: string): Promise<{ ok: boolean; rows: unknown[]; detail: string }> {
  const res = await fetch(`${API}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const bodyJson = await res.json().catch(() => null);
  return { ok: res.ok, rows: Array.isArray(bodyJson) ? bodyJson : [], detail: `${res.status}` };
}

async function anonFn(key: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/functions/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
  return (await res.json().catch(() => ({ found: undefined, status: res.status }))) as Record<string, unknown>;
}

export default { process: 'content-to-conversion', run } satisfies ScenarioModule;
