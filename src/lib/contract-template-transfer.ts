import { homeCurrency } from '@/lib/platform-fallbacks';
/**
 * Contract template import/export — templates as portable files.
 *
 * Why this exists: data sovereignty is the platform's selling point, and a
 * self-hosting operator must be able to take their agreement templates OUT in
 * a readable format — and move them between instances (author on one, import
 * on the fleet) without SQL access or an agent copying rows over MCP.
 *
 * The bundle is plain JSON with the authorable fields only. No ids, no
 * timestamps, no is_default: identity and defaults belong to the receiving
 * instance, not the file.
 */

export const BUNDLE_FORMAT = 'flowwink-contract-templates';
export const BUNDLE_VERSION = 1;

export interface TransferableTemplate {
  name: string;
  description: string | null;
  contract_type: string;
  language: string;
  body_markdown: string;
  default_currency: string;
  default_renewal_type: string;
  default_renewal_notice_days: number | null;
  default_value_cents: number | null;
  is_public: boolean;
  is_active: boolean;
}

export interface TemplateBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exported_at: string;
  templates: TransferableTemplate[];
}

/**
 * The tokens the renderer fills. MUST match the allowlist in
 * `_contract_template_unrendered_tokens` (latest migration) — a guardrail
 * test compares this list against the migration file, so the two cannot
 * drift silently. An imported template using a token outside this list would
 * render it as literal {{text}} in a legal document.
 */
export const KNOWN_TOKENS = [
  'counterparty.name', 'counterparty.email', 'today', 'start_date', 'end_date',
  'value', 'currency', 'title', 'counterparty.org_number', 'counterparty.address',
  'supplier.name', 'supplier.org_number', 'supplier.address', 'supplier.phone',
  'supplier.email', 'supplier.signatory', 'terms_url', 'site_url', 'quote.lines',
] as const;

export function buildBundle(templates: TransferableTemplate[]): TemplateBundle {
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    templates,
  };
}

export function toTransferable(row: Record<string, unknown>): TransferableTemplate {
  return {
    name: String(row.name ?? ''),
    description: (row.description as string) ?? null,
    contract_type: String(row.contract_type ?? 'service'),
    language: String(row.language ?? 'en'),
    body_markdown: String(row.body_markdown ?? ''),
    // A template without one takes the business's (String(undefined) wrote the
    // word "undefined" as the currency — introduced and fixed 2026-10-26).
    default_currency: String(row.default_currency ?? homeCurrency()),
    default_renewal_type: String(row.default_renewal_type ?? 'none'),
    default_renewal_notice_days: (row.default_renewal_notice_days as number) ?? null,
    default_value_cents: (row.default_value_cents as number) ?? null,
    is_public: Boolean(row.is_public),
    is_active: Boolean(row.is_active),
  };
}

/** Parse and validate an uploaded bundle. Throws with a human message. */
export function parseBundle(raw: string): TemplateBundle {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('Not valid JSON.');
  }
  const b = json as Partial<TemplateBundle>;
  if (b.format !== BUNDLE_FORMAT) {
    throw new Error(`Not a contract template bundle (format: ${String(b.format ?? 'unknown')}).`);
  }
  if (typeof b.version !== 'number' || b.version > BUNDLE_VERSION) {
    throw new Error(`Bundle version ${String(b.version)} is newer than this instance supports (${BUNDLE_VERSION}).`);
  }
  if (!Array.isArray(b.templates) || b.templates.length === 0) {
    throw new Error('Bundle contains no templates.');
  }
  for (const t of b.templates) {
    if (!t || typeof t !== 'object' || !String((t as TransferableTemplate).name ?? '').trim()) {
      throw new Error('A template in the bundle is missing a name.');
    }
    if (!String((t as TransferableTemplate).body_markdown ?? '').trim()) {
      throw new Error(`Template "${(t as TransferableTemplate).name}" has an empty body.`);
    }
  }
  return b as TemplateBundle;
}

/** Every {{token}} in the body that the renderer will NOT fill. */
export function unknownTokens(body: string): string[] {
  const seen = new Set<string>();
  for (const m of (body ?? '').matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
    if (!(KNOWN_TOKENS as readonly string[]).includes(m[1])) seen.add(m[1]);
  }
  return [...seen];
}

export type ImportStatus = 'new' | 'exists';

export interface ImportPlanItem {
  template: TransferableTemplate;
  status: ImportStatus;
  unknownTokens: string[];
}

/**
 * Plan an import against existing names. Collisions are SKIPPED, never
 * overwritten: existing templates may be version-frozen references from
 * signed agreements — an import must not be able to rewrite them.
 */
export function planImport(
  bundle: TemplateBundle,
  existingNames: string[],
): ImportPlanItem[] {
  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  return bundle.templates.map((t) => ({
    template: t,
    status: existing.has(t.name.trim().toLowerCase()) ? 'exists' : 'new',
    unknownTokens: unknownTokens(t.body_markdown),
  }));
}
