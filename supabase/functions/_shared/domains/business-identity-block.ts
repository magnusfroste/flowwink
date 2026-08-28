// Business Identity as a prompt block — the grounding every outward-writing
// AI task should carry.
//
// Found while auditing campaign generation (2026-08-14): the content_proposal
// task asked the USER to retype brand voice, audience and industry per run
// while the answers sat in site_settings.company_profile — the exact page
// sales/marketing now curate. Same gap class as the fit analysis' missing
// our_context. This loader is deliberately in _shared/domains so every task
// that writes in the company's voice (content proposals, social batches, ad
// creative, …) grounds the same way — one identity, many mouths.
//
// ─── Two projections, chosen by the CALLER (2026-08-22) ─────────────────────
//
// FlowWork was asked for a landing page and produced well-written, generic
// prose in two plain text blocks. The diagnosis was not the model: the block
// handed it nine ASSERTIONS (what we do, for whom, what we will not claim) and
// no MATERIAL — no story, no numbers, no outcomes. On the live instance the
// profile held 44 fields / 8 380 characters; `about_us` (706 chars) and
// `delivered_value` (578 chars) — the richest prose the company owns — never
// reached the prompt. And when FlowWork writes a landing page the other
// knowledge sources are deliberately switched OFF (a landing page rests on the
// Business Identity, not on twelve chunks of internal wiki), so the identity is
// not one context source among several — it is the ENTIRE input. A thin
// identity does not make that task worse; it makes it impossible.
//
// But the identity is ALWAYS-ON: every public-chat turn, every workspace turn,
// every iteration of a heartbeat that runs around the clock. Shipping all 44
// fields would be a company REGISTER, not an identity, billed per turn forever.
//
// So: two widths, and the width is set by the CALLER as an explicit argument.
//   'core'      — the constitution. Who we are, what we sell, to whom, plus the
//                 two RULES (claim stance, boundaries). ~470 tokens. The
//                 default, because a surface that forgets should pay nothing.
//   'narrative' — core + the material a writer needs to be concrete: purpose,
//                 the story, delivered outcomes, service descriptions, proof,
//                 age and size. ~850–1000 tokens on a filled profile.
//
// Law 1 compliance: the width is a parameter a call site sets statically from
// what that surface IS (a page author vs. a support answer). Nothing here reads
// the user's message to guess intent — no regex, no keyword list. Which call
// site gets which width is pinned in
// src/lib/__tests__/business-identity-projection.guardrails.test.ts, so a
// writer that forgets to opt in fails CI instead of shipping generic copy.
//
// Soft-fail, but never SILENT: a missing profile → empty string (a fresh
// instance has no identity yet; that is not a fault). A profile we could not
// READ → a short degraded marker telling the model it does not know who this
// company is, plus a console.error. The old code returned '' for both, and
// three call sites wrapped that in `.catch(() => '')` on top — two layers of
// silence over the project's dominant bug class.

// ─── The shapes the material is held in (2026-08-22, same day) ─────────────
//
// Widening the projection surfaced the other half of the problem: several
// fields held only HALF of what a block needs, so a page-authoring agent had
// to write the other half itself. `differentiators` were labels with no
// explanation (a features block needs both); no field held a number AS a
// number, so metrics had to be mined out of `delivered_value` prose — the
// exact spot where a model fabricates; nothing said what the visitor should
// DO; and testimonials were one blob, which renders as a paragraph.
//
// So `differentiators` now carries {name, description} like services,
// `proof_points` holds {value, label, context}, `client_testimonials` holds
// {quote, author, role, company}, and `primary_cta` holds {label, destination,
// intent}. Every renderer below still reads the LEGACY shape (a string list, a
// testimonial blob) — profiles are written by agents and by the editor, and a
// profile nobody has re-saved must not go dark. Shapes are coerced on the write
// path (_shared/handlers/company-profile.ts) and on frontend read
// (src/lib/company-profile-shapes.ts); this file only projects.

/** Which projection of the identity a caller needs. Set statically per surface. */
export type IdentityDepth = 'core' | 'narrative';

export interface BusinessIdentity {
  /** Ready to concatenate onto a system prompt. '' when there is nothing to say. */
  block: string;
  /** false = the settings read FAILED. Distinct from an instance with no profile yet. */
  ok: boolean;
  /** true = the block is the degraded marker, not the identity. */
  degraded: boolean;
  /** The profile keys that actually reached the prompt — for tracing and tests. */
  fields: string[];
}

interface FieldSpec {
  key: string;
  label: string;
  /** 'core' emits in both projections; 'narrative' only in the wide one. */
  depth: IdentityDepth;
  render?: (value: unknown, depth: IdentityDepth) => string;
}

/**
 * The allowlist, in prompt order. An allowlist and not a denylist on purpose:
 * `update_company_profile` shallow-merges ANY key an agent sends, so the stored
 * object grows keys nobody designed (`tagline`, `business_purpose` are already
 * there on live instances and appear in no editor). A denylist would leak every
 * future one into every prompt.
 *
 * Derived from the live editor's own grouping (CompanyInsightsPage tabs:
 * identity / market / financials / enrichment) plus what the block is FOR.
 *
 * Deliberately NOT emitted, in either projection:
 *   competitors        — this block carries a `boundaries` rule that on live
 *                        instances names competitors as off-limits for the
 *                        channel. Reciting them every turn invites exactly the
 *                        reasoning the boundary forbids. Prospecting has its
 *                        own wider context (_shared/sales-context.ts).
 *   pricing_notes      — internal strategy. A public chat must not quote price
 *                        ranges out of a settings field; quotes and pricelists
 *                        are the sourced path.
 *   revenue, financial_health, board_members, org_number, legal_name
 *                      — the company REGISTER: facts about the legal entity,
 *                        not the identity that writes. Invoices and contracts
 *                        read them directly where they belong.
 *   contact_email, contact_phone, address, domain
 *                      — routing data owned by footers, signatures and the
 *                        email shell. In a prompt it is mostly an invitation to
 *                        publish a phone number into body copy.
 *   enrichment_log     — metadata about the profile, not the company.
 */
export const IDENTITY_FIELDS: FieldSpec[] = [
  { key: 'company_name', label: 'Company', depth: 'core' },
  // Tiny (a single line) and the densest identity fact there is — cheap enough
  // to carry everywhere. Absent on most instances, and then it costs nothing.
  { key: 'tagline', label: 'Tagline', depth: 'core' },
  { key: 'industry', label: 'Industry', depth: 'core' },

  // ── The material. Absent from the old projection; this is the 1 284 chars of
  //    company story that never reached the landing-page prompt.
  { key: 'business_purpose', label: 'Why the company exists', depth: 'narrative' },
  { key: 'about_us', label: 'About the company (the company\'s own words)', depth: 'narrative' },
  { key: 'founded_year', label: 'Founded', depth: 'narrative' },
  { key: 'employees', label: 'Team size', depth: 'narrative' },

  { key: 'value_proposition', label: 'Value proposition', depth: 'core' },
  { key: 'delivered_value', label: 'Value actually delivered to customers', depth: 'narrative' },
  { key: 'icp', label: 'Ideal customer profile', depth: 'core' },
  { key: 'differentiators', label: 'Differentiators', depth: 'core', render: renderNamedItems },
  { key: 'services', label: 'Services', depth: 'core', render: renderNamedItems },
  { key: 'target_industries', label: 'Target industries', depth: 'core' },

  // Proof. Empty on the instance that surfaced this, but a landing page written
  // without it when it EXISTS is the same omission over again.
  { key: 'clients', label: 'Notable customers', depth: 'narrative' },
  // The figures, held as figures. Narrative and not core for the same reason
  // delivered_value is: a support answer states no metrics, a page does. The
  // label says verbatim because that is the whole point of the field — a number
  // re-derived from prose is a number one step from being wrong.
  {
    key: 'proof_points',
    label: 'Proof points (verbatim figures — quote these; derive no others)',
    depth: 'narrative',
    render: renderProofPoints,
  },
  { key: 'client_testimonials', label: 'Customer testimonials', depth: 'narrative', render: renderTestimonials },
  // What the reader should DO. Narrative only: the always-on surfaces route
  // through `boundaries` and the channel they already sit in, while a page or a
  // campaign that ends without an ask is not a page or a campaign. Unlike
  // contact_email/phone above, this is curated FOR publication — that is the
  // difference between routing data and the company's own ask.
  { key: 'primary_cta', label: 'Primary call to action', depth: 'narrative', render: renderPrimaryCta },
];

/**
 * Present-or-omitted, never an empty heading.
 *
 * An empty field must vanish, not ship as `Notable customers: ` — a model that
 * reads a blank heading concludes the company has no customers and writes
 * around a hole it invented. Note the old code used bare truthiness, and `[]`
 * is truthy in JS: an instance with `differentiators: []` emitted exactly that
 * empty heading.
 */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : item == null ? '' : String(item).trim()))
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

/**
 * services AND differentiators are [{id, name, description}] (legacy: a
 * Record<name, description> for services, a plain string list for
 * differentiators). The description is the concrete part — WHAT the service
 * does, WHAT the differentiator means — so the narrow projection lists names
 * (enough not to contradict the identity) and the wide one carries the
 * descriptions (the material a writer needs, and the half it would otherwise
 * invent).
 */
function renderNamedItems(value: unknown, depth: IdentityDepth): string {
  const items: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value as Record<string, unknown>).map(([name, description]) => ({ name, description }))
      : [];

  const rows = items
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const o = item as { name?: unknown; description?: unknown };
      const name = text(o.name);
      if (!name) return '';
      const description = depth === 'narrative' ? text(o.description) : '';
      return description ? `${name} — ${description}` : name;
    })
    .filter(Boolean);

  if (rows.length === 0) return '';
  return depth === 'narrative' && rows.some((r) => r.includes(' — '))
    ? `\n  - ${rows.join('\n  - ')}`
    : rows.join('; ');
}

/**
 * proof_points is [{id, value, label, context}] (an agent may still send a bare
 * string, which the write path splits on a LEADING figure only). Rendered one
 * per line: a stats block reads pairs, and a comma-joined run of figures is
 * where two numbers become one wrong one.
 */
function renderProofPoints(value: unknown, _depth: IdentityDepth): string {
  if (!Array.isArray(value)) return text(value);
  const rows = value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const o = item as { value?: unknown; label?: unknown; context?: unknown };
      const figure = text(o.value);
      const label = text(o.label);
      if (!figure && !label) return '';
      const context = text(o.context);
      return `${[figure, label].filter(Boolean).join(' ')}${context ? ` (${context})` : ''}`;
    })
    .filter(Boolean);
  return rows.length ? `\n  - ${rows.join('\n  - ')}` : '';
}

/**
 * client_testimonials is [{id, quote, author, role, company}]; the legacy shape
 * is one prose blob, which passes through untouched (it often carries its own
 * attribution and must not be re-labelled by us).
 *
 * A quote whose author is empty is emitted as the quote alone — never with a
 * borrowed name from `clients`. The narrative directive carries that rule for
 * the whole block rather than repeating a marker per row.
 */
function renderTestimonials(value: unknown, _depth: IdentityDepth): string {
  if (!Array.isArray(value)) return text(value);
  const rows = value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const o = item as { quote?: unknown; author?: unknown; role?: unknown; company?: unknown };
      const quote = text(o.quote);
      if (!quote) return '';
      const who = [text(o.author), text(o.role), text(o.company)].filter(Boolean).join(', ');
      return who ? `"${quote}" — ${who}` : `"${quote}"`;
    })
    .filter(Boolean);
  return rows.length ? `\n  - ${rows.join('\n  - ')}` : '';
}

/**
 * primary_cta is {label, destination, intent} — or a bare string on a profile
 * an agent wrote before the field had a shape. A CTA with no label is not a
 * button and is omitted rather than rendered as an empty ask.
 */
function renderPrimaryCta(value: unknown, _depth: IdentityDepth): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const o = value as { label?: unknown; destination?: unknown; intent?: unknown };
  const label = text(o.label);
  if (!label) return '';
  const destination = text(o.destination);
  const intent = text(o.intent);
  return `${label}${destination ? ` → ${destination}` : ''}${intent ? ` (${intent})` : ''}`;
}

/**
 * The whole input, when everything else is off.
 *
 * Appended only in the wide projection, because that is the one a page/campaign
 * author uses — and for that author the identity is not context, it is the
 * source. Two jobs: spend the specifics instead of paraphrasing them into
 * platitudes, and do not fill the gaps with invention (a generous identity that
 * invites fabrication trades one failure for a worse one).
 */
const NARRATIVE_DIRECTIVE =
  '\nWriting from this identity: the material above is the company\'s own — its story, its numbers, ' +
  'its named outcomes and customers. Use those specifics; a sentence that would read the same for any ' +
  'company in this industry is a sentence to rewrite. Where a specific is missing, write around it — ' +
  'never invent a customer, a number, a date or a result that is not stated here. ' +
  'Numbers and quotes are the sharp edges: state no figure that is not written above — do not derive, ' +
  'round or convert one out of prose — and attribute no quote to a person the identity does not name; ' +
  'an unattributed quote stays unattributed.';

/**
 * The failure path, made visible.
 *
 * `.catch(() => '')` at three call sites meant a failed settings read produced
 * an identity-free prompt that nobody was told about — and the model answered
 * confidently anyway, in generic prose indistinguishable from a thin profile.
 * A fresh instance with no profile is NOT this case and still returns ''.
 */
const DEGRADED_MARKER =
  '\n\n## Company identity — UNAVAILABLE\n' +
  'The company\'s Business Identity could not be read (the settings lookup failed). You do not know who ' +
  'this company is, what it sells or whom it serves. Do not invent company facts, offerings, customers ' +
  'or numbers. If asked to write outward-facing content, say the identity is unavailable rather than ' +
  'producing generic copy.';

/**
 * Load the identity as a structured result. Prefer this over the string wrapper
 * when the caller can act on `ok` / `fields` (tracing, health checks, tests).
 */
export async function loadBusinessIdentity(
  supabase: any,
  depth: IdentityDepth = 'core',
): Promise<BusinessIdentity> {
  let raw: Array<{ key: string; value: unknown }>;
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['company_profile', 'brand_tone']);
    if (error) throw error;
    raw = (data ?? []) as Array<{ key: string; value: unknown }>;
  } catch (err) {
    // Loud on the way out, so a caller's `.catch(() => '')` cannot re-silence it.
    console.error('[business-identity] settings read FAILED — prompt runs without identity:', err);
    return { block: DEGRADED_MARKER, ok: false, degraded: true, fields: [] };
  }

  const map: Record<string, unknown> = {};
  for (const row of raw) map[row.key] = row.value;
  return composeIdentityBlock(map, depth);
}

/**
 * The pure half of loadBusinessIdentity: settings values in, prompt block out.
 * No I/O, no Deno — importable by the admin editor, whose "what the agent
 * sees" preview must be THIS function, not a client-side re-implementation
 * that drifts. `map` holds the raw site_settings values keyed by settings key
 * (`company_profile`, `brand_tone`).
 */
export function composeIdentityBlock(
  map: Record<string, unknown>,
  depth: IdentityDepth = 'core',
): BusinessIdentity {
  const cp = (map.company_profile && typeof map.company_profile === 'object' && !Array.isArray(map.company_profile)
    ? map.company_profile
    : {}) as Record<string, unknown>;

  const lines: string[] = [];
  const fields: string[] = [];

  for (const spec of IDENTITY_FIELDS) {
    if (spec.depth === 'narrative' && depth !== 'narrative') continue;
    const value = (spec.render ?? text)(cp[spec.key], depth);
    if (!value) continue; // omitted entirely — never an empty heading
    lines.push(value.startsWith('\n') ? `${spec.label}:${value}` : `${spec.label}: ${value}`);
    fields.push(spec.key);
  }

  const brandTone = typeof map.brand_tone === 'string'
    ? map.brand_tone.trim()
    : map.brand_tone
      ? JSON.stringify(map.brand_tone)
      : '';
  if (brandTone) {
    lines.push(`Brand tone: ${brandTone}`);
    fields.push('brand_tone');
  }

  // claim_stance is a RULE about form, not a fact to recite — it governs how
  // every claim is phrased (e.g. "describe our services; never interpret
  // regulations on a customer's behalf; never imply buying us = compliance").
  // Appended after the facts so it reads as an instruction, and it must win
  // over the brief: a campaign brief cannot talk the model out of the stance.
  const claimStance = text(cp.claim_stance);
  const stance = claimStance
    ? `\nClaim stance (a rule about HOW claims are made — it overrides the brief): ${claimStance}`
    : '';
  if (claimStance) fields.push('claim_stance');

  // Boundaries: topics this channel must NOT answer, however well it could.
  // Not secrecy — the questions are legitimate and get answered, by a person.
  // An agent that reasons freely about network routes, ownership or named
  // competitors does damage no amount of accuracy repairs, so this is stated
  // as a refusal WITH a route, never as a gap.
  const boundaries = text(cp.boundaries);
  const bounds = boundaries
    ? `\nOff-limits for this channel (answer by pointing to a human, never by reasoning about it — say the question is legitimate and that we answer it directly): ${boundaries}`
    : '';
  if (boundaries) fields.push('boundaries');

  // Nothing to say is not a fault — a fresh instance has no identity yet, and
  // the fresh-site playbook exists to fill it. (The old guard returned '' when
  // there were no FACT lines, which silently dropped a profile that carried
  // only the two rules.)
  if (lines.length === 0 && !stance && !bounds) {
    return { block: '', ok: true, degraded: false, fields: [] };
  }

  const directive = depth === 'narrative' ? NARRATIVE_DIRECTIVE : '';
  const block =
    `\n\n## Company identity (Business Identity — ground everything in this)\n${lines.join('\n')}` +
    `${stance}${bounds}\n` +
    'Write as this company. Never contradict the identity; when the brief leaves voice, audience or ' +
    `industry unspecified, derive them from here.${directive}`;

  return { block, ok: true, degraded: false, fields };
}

/**
 * String-only wrapper — the shape every call site already concatenates.
 * Failure is already logged (and now visible in the prompt) inside
 * loadBusinessIdentity, so an outer `.catch(() => '')` can no longer hide it.
 */
export async function loadBusinessIdentityBlock(
  supabase: any,
  depth: IdentityDepth = 'core',
): Promise<string> {
  return (await loadBusinessIdentity(supabase, depth)).block;
}
