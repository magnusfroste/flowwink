/**
 * Business Identity — the structured shapes, and the read-side migrations that
 * carry old data into them.
 *
 * Why these shapes exist (2026-08-22): a page-authoring agent reads
 * site_settings.company_profile and has to emit BLOCKS. A `features` block
 * needs title + description per item; a `stats` block needs {value, label}
 * pairs; a `testimonial` block needs {quote, author, role, company}. Where the
 * profile held only labels (`differentiators: string[]`) or one prose blob
 * (`delivered_value`, `client_testimonials`), the model had two ways out:
 * write the missing halves itself — i.e. invent — or fall back to a prose
 * block. Both are worse than the profile simply holding the field.
 *
 * The rule this encodes: a number must be stored AS a number-with-a-label,
 * never parsed back out of a sentence. Parsing metrics out of prose is the
 * exact spot where a model fabricates.
 *
 * Nothing here migrates prose into structure on its own — `delivered_value`
 * stays prose, and its metrics are only ever promoted to proof_points by a
 * human or an agent that re-reads the source. Splitting a sentence into
 * {value, label} guesses would reintroduce the fabrication we are removing.
 *
 * The edge side mirrors these coercions in
 * supabase/functions/_shared/handlers/company-profile.ts (write path) and
 * projects them in _shared/domains/business-identity-block.ts (prompt path).
 * Three copies, one contract — pinned by
 * src/lib/__tests__/business-identity-projection.guardrails.test.ts.
 */

/** Services and differentiators share one shape: a label WITH its explanation. */
export interface NamedItem {
  id: string;
  name: string;
  description: string;
}

/** A number held as a number, with the words that make it mean something. */
export interface ProofPoint {
  id: string;
  /** The figure exactly as it should be printed: "412 km", "99,98 %", "1 200". */
  value: string;
  /** What the figure counts: "kanalisation byggd", "uptime". */
  label: string;
  /** Optional qualifier: period, scope, source. */
  context: string;
}

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role: string;
  company: string;
}

/** What the visitor should DO. A landing page without this is not a landing page. */
export interface PrimaryCta {
  /** Button text: "Boka ett möte". */
  label: string;
  /** Where it goes: a path, URL, mailto: or tel:. */
  destination: string;
  /** What it is FOR, in the company's words: "book a 30-min scoping call". */
  intent: string;
}

const newId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID?.() ?? `cp-${Math.random().toString(36).slice(2, 11)}`;
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

const pick = (o: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return '';
};

/** True for '', [], {}, null, undefined — used so enrichment only fills genuinely empty fields. */
export function isBlankValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/**
 * `[{id, name, description}]` from: the canonical array, plain strings
 * (legacy `differentiators: string[]` — the label survives, the description is
 * left EMPTY rather than invented), the legacy `Record<name, description>`
 * services form, or a single string.
 */
export function normalizeNamedItems(raw: unknown): NamedItem[] {
  const out: NamedItem[] = [];
  const push = (name: unknown, description: unknown, id?: unknown) => {
    const n = str(name);
    if (!n) return; // nameless entries render as empty cards — drop them
    out.push({ id: str(id) || newId(), name: n, description: str(description) });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') push(item, '');
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        push(
          pick(o, ['name', 'service', 'title', 'label']),
          pick(o, ['description', 'desc', 'summary', 'details']),
          o.id,
        );
      }
    }
  } else if (typeof raw === 'string') {
    push(raw, '');
  } else if (raw && typeof raw === 'object') {
    for (const [name, description] of Object.entries(raw as Record<string, unknown>)) push(name, description);
  }
  return out;
}

/**
 * Leading figure + unit, then the rest as the label: "412 km kanalisation"
 * → {value: "412 km", label: "kanalisation"}. Deterministic and conservative:
 * a string that does not START with a digit keeps its whole text as the label
 * and an EMPTY value, so nothing is guessed into a stats tile.
 */
function splitLeadingFigure(text: string): { value: string; label: string } {
  const m = text.match(/^([+-]?\d[\d\s.,]*)\s*(%|[^\s\d]{1,12})?\s*(.*)$/u);
  if (!m) return { value: '', label: text };
  const rest = (m[3] ?? '').trim();
  const unit = (m[2] ?? '').trim();
  const value = `${m[1].trim()}${unit ? ` ${unit}` : ''}`;
  // A figure with nothing after it is a value without a label — keep the label
  // empty rather than repeating the number into it.
  return { value, label: rest };
}

export function normalizeProofPoints(raw: unknown): ProofPoint[] {
  const out: ProofPoint[] = [];
  const push = (value: unknown, label: unknown, context: unknown, id?: unknown) => {
    const v = str(value);
    const l = str(label);
    if (!v && !l) return;
    out.push({ id: str(id) || newId(), value: v, label: l, context: str(context) });
  };

  const items = Array.isArray(raw) ? raw : raw === null || raw === undefined || raw === '' ? [] : [raw];
  for (const item of items) {
    if (typeof item === 'string' || typeof item === 'number') {
      const { value, label } = splitLeadingFigure(str(item));
      push(value, label, '');
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      push(
        pick(o, ['value', 'number', 'metric', 'stat', 'figure']),
        pick(o, ['label', 'title', 'name', 'caption', 'unit_label']),
        pick(o, ['context', 'description', 'note', 'period', 'source']),
        o.id,
      );
    }
  }
  return out;
}

/**
 * The legacy single blob becomes ONE testimonial with an empty author — an
 * unattributed quote is honest; a guessed attribution is a fabricated
 * reference. Splitting a blob into several quotes is likewise not attempted.
 */
export function normalizeTestimonials(raw: unknown): Testimonial[] {
  const out: Testimonial[] = [];
  const push = (quote: unknown, author: unknown, role: unknown, company: unknown, id?: unknown) => {
    const q = str(quote);
    if (!q) return;
    out.push({ id: str(id) || newId(), quote: q, author: str(author), role: str(role), company: str(company) });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') push(item, '', '', '');
      else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        push(
          pick(o, ['quote', 'text', 'body', 'testimonial', 'content']),
          pick(o, ['author', 'name', 'by', 'person']),
          pick(o, ['role', 'title', 'position']),
          pick(o, ['company', 'organization', 'org', 'company_name']),
          o.id,
        );
      }
    }
  } else if (typeof raw === 'string') {
    push(raw, '', '', '');
  } else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    push(
      pick(o, ['quote', 'text', 'body', 'testimonial', 'content']),
      pick(o, ['author', 'name', 'by', 'person']),
      pick(o, ['role', 'title', 'position']),
      pick(o, ['company', 'organization', 'org', 'company_name']),
      o.id,
    );
  }
  return out;
}

/** A CTA with no label cannot be rendered as a button — that is `null`, not a blank one. */
export function normalizePrimaryCta(raw: unknown): PrimaryCta | null {
  if (typeof raw === 'string') {
    const label = raw.trim();
    return label ? { label, destination: '', intent: '' } : null;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const label = pick(o, ['label', 'text', 'title', 'cta', 'cta_label']);
    if (!label) return null;
    return {
      label,
      destination: pick(o, ['destination', 'url', 'href', 'link', 'target', 'path']),
      intent: pick(o, ['intent', 'goal', 'action', 'description']),
    };
  }
  return null;
}

/** The structured keys — anything not listed here is passed through untouched. */
export const STRUCTURED_PROFILE_KEYS = [
  'services',
  'differentiators',
  'proof_points',
  'client_testimonials',
  'primary_cta',
] as const;

/**
 * Coerce every structured key that is PRESENT. Absent keys stay absent, so this
 * is safe on a partial (enrichment / agent merge) payload as well as a full profile.
 */
export function normalizeCompanyProfileShapes<T extends Record<string, unknown>>(raw: T): T {
  const next: Record<string, unknown> = { ...raw };
  if ('services' in next) next.services = normalizeNamedItems(next.services);
  if ('differentiators' in next) next.differentiators = normalizeNamedItems(next.differentiators);
  if ('proof_points' in next) next.proof_points = normalizeProofPoints(next.proof_points);
  if ('client_testimonials' in next) next.client_testimonials = normalizeTestimonials(next.client_testimonials);
  if ('primary_cta' in next) next.primary_cta = normalizePrimaryCta(next.primary_cta);
  return next as T;
}
