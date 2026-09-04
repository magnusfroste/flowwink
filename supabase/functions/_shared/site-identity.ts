/**
 * site-identity — what belongs to THIS instance, and must not travel.
 *
 * A template is a design that moves. The settings around it are not design:
 * they say who this is. Exporting them verbatim was a silent leak, and the
 * export of the Restagård site made it concrete — the body carried
 *
 *   chatSettings.welcomeMessage:
 *     "…sign in (demo@flowwink.com / demo1234) and poke around."
 *
 * Installed on a customer, their chat widget would greet visitors with somebody
 * else's login. Alongside it: organizationName "FlowWink Demo", the demo
 * concierge system prompt, the demo's SEO title on every page, and
 * demo@flowwink.com as the footer contact.
 *
 * Two mechanisms, because one is not enough:
 *
 *   1. A NAMED SET of identity fields, removed by default. Precise, and it
 *      explains each removal.
 *   2. A SECRET SCAN over everything that survives. The named set will always
 *      be incomplete — settings gain fields, and the field that leaks next has
 *      not been written yet. The scan is the half that keeps working.
 *
 * Deliberately dependency-free: this file is imported by the Deno edge function
 * AND by the browser bundle, because the export exists in both and a rule with
 * two copies is a rule that drifts.
 */

export interface StrippedField {
  path: string;
  why: string;
}

export interface SecretHit {
  path: string;
  kind: 'email' | 'credential' | 'token' | 'endpoint';
  redacted: string;
  /**
   * The value sits in a field whose NAME says it is example text
   * (emailPlaceholder, fields[].placeholder, …), so it is almost certainly
   * "din@epost.se" rather than a real address. Reported, never hidden — but
   * the caller should render it quietly. A warning that cries wolf stops being
   * read, and then it is worthless on the day it matters (#100).
   *
   * Only ever set for `email`: a token or credential pattern in a placeholder
   * field is still worth shouting about — nobody puts a real API key in an
   * example, so if one is there, something is wrong.
   */
  placeholder?: true;
}

/**
 * Field names that announce their own contents as an example. Matched against
 * the LEAF key, so both `placeholder` and camelCase `emailPlaceholder` count
 * (the live case was `data.emailPlaceholder`, where the word is preceded by
 * "email" rather than a separator — the first regex missed it).
 */
const PLACEHOLDER_KEY_RE = /(place_?holder|example|sample|dummy)s?$/i;

/** The last key in a dotted path, with any array indices stripped. */
function leafKey(path: string): string {
  const last = path.split('.').pop() ?? '';
  return last.replace(/\[\d+\]/g, '');
}

export interface IdentityReport {
  stripped: StrippedField[];
  kept_identity: boolean;
  possible_secrets: SecretHit[];
  broken_nav_targets: Array<{ label: string; url: string }>;
  note: string;
}

/**
 * The named set. Each entry is a dotted path into the template body plus the
 * reason it does not travel — a removal a caller cannot understand is a removal
 * they will disable.
 */
export const IDENTITY_FIELDS: ReadonlyArray<{ path: string; why: string }> = [
  // Who the company is
  { path: 'branding.organizationName', why: 'The origin company\'s name — it would rename the installed site.' },
  { path: 'branding.brandTagline', why: 'The origin company\'s tagline.' },
  { path: 'branding.logo', why: 'The origin company\'s logo, and the URL points back at their storage.' },

  // What the agent says it is — the field that carried a password
  { path: 'chatSettings.systemPrompt', why: 'Describes the origin business to the model; installed elsewhere the agent would claim to be them.' },
  { path: 'chatSettings.welcomeMessage', why: 'Visitor-facing copy about the origin site. This is the field that carried demo credentials.' },
  { path: 'chatSettings.suggestedPrompts', why: 'Questions written about the origin business.' },
  { path: 'chatSettings.widgetButtonText', why: 'Origin-specific copy.' },

  // Where requests would be sent
  { path: 'chatSettings.n8nWebhookUrl', why: 'An endpoint belonging to the origin instance — traffic from the new site would go there.' },
  { path: 'chatSettings.localEndpoint', why: 'An endpoint belonging to the origin instance.' },
  { path: 'chatSettings.sttLocalEndpoint', why: 'An endpoint belonging to the origin instance.' },
  { path: 'chatSettings.ttsLocalEndpoint', why: 'An endpoint belonging to the origin instance.' },
  { path: 'chatSettings.openaiBaseUrl', why: 'May point at a proxy the origin instance operates.' },

  // How the site introduces itself to search engines
  { path: 'seoSettings.siteTitle', why: 'The origin site\'s name — it would title every page of the new one.' },
  { path: 'seoSettings.titleTemplate', why: 'Carries the origin site\'s name into every page title.' },
  { path: 'seoSettings.defaultDescription', why: 'Describes the origin business.' },

  // How to reach them
  { path: 'footerSettings.email', why: 'The origin company\'s contact address.' },
  { path: 'footerSettings.phone', why: 'The origin company\'s phone number.' },
  { path: 'footerSettings.address', why: 'The origin company\'s address.' },
  { path: 'footerSettings.socialLinks', why: 'The origin company\'s social profiles.' },

  // How the site presents itself to answer engines
  { path: 'aeoSettings.organizationName', why: 'The origin company\'s name in the schema.org Organization.' },
  { path: 'aeoSettings.shortDescription', why: 'Describes the origin business to answer engines.' },
  { path: 'aeoSettings.contactEmail', why: 'The origin company\'s contact address.' },
];

/**
 * The product's own templates (category "platform": the FlowWink marketing
 * site, the demo company, the agency site) ARE their identity — installing one
 * is installing that site. Every other template is a design carrying a
 * fictional business as filler.
 */
export function isProductTemplate(template: Record<string, unknown>): boolean {
  return template?.category === 'platform';
}

/**
 * On INSTALL, a business template's fictional identity must not become the
 * site's. New liteit (2026-09-05) installed "momentum" and was born as
 * Momentum: the chat introduced itself as "Momentum's AI", the footer said
 * hello@momentum.dev, San Francisco, every page title ended "| Momentum", and
 * the schema.org organization was a developer platform that does not exist.
 * The export side has stripped these fields since the demo-credentials
 * incident; the install side is the same policy in the other direction.
 * Product templates keep theirs.
 */
export function installIdentityPolicy<T extends Record<string, unknown>>(template: T): { template: T; stripped: StrippedField[] } {
  if (isProductTemplate(template)) return { template, stripped: [] };
  const policy = applyIdentityPolicy(template, true);
  return { template: policy.template, stripped: policy.identity.stripped };
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

function deletePath(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  const last = parts.pop()!;
  const parent = parts.reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined),
    obj,
  );
  if (!parent || typeof parent !== 'object') return false;
  const p = parent as Record<string, unknown>;
  if (!(last in p)) return false;
  delete p[last];
  return true;
}

/** A value worth removing: present, and not already empty. */
function isPresent(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

// ---------------------------------------------------------------------------
// The secret scan — the half that survives new fields
// ---------------------------------------------------------------------------

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
// "sign in (demo@x.com / demo1234)", "password: hunter2", "lösenord hunter2"
const CREDENTIAL_RE = /(?:password|passwd|pwd|lösenord|losenord|api[_\s-]?key|secret|credential)\s*[:=]?\s*\S{4,}/gi;
const TOKEN_RE = /\b(?:sk-[A-Za-z0-9_-]{16,}|fwk_[A-Za-z0-9_-]{12,}|sbp_[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}|Bearer\s+\S{16,})/g;
const CREDENTIALED_URL_RE = /https?:\/\/[^/\s:]+:[^@\s]+@\S+/g;

function redact(s: string): string {
  if (s.length <= 6) return '***';
  return `${s.slice(0, 3)}…${s.slice(-2)} (${s.length} chars)`;
}

/**
 * Walk every string in the body and flag what looks like it should not be in a
 * template. Reports, never removes: a false positive that deleted content would
 * be worse than the leak. Values are redacted — a report that prints the secret
 * has only moved it.
 */
export function scanForSecrets(value: unknown, path = ''): SecretHit[] {
  const hits: SecretHit[] = [];

  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      for (const m of v.match(CREDENTIALED_URL_RE) ?? []) {
        hits.push({ path: p, kind: 'endpoint', redacted: redact(m) });
      }
      for (const m of v.match(TOKEN_RE) ?? []) {
        hits.push({ path: p, kind: 'token', redacted: redact(m) });
      }
      for (const m of v.match(CREDENTIAL_RE) ?? []) {
        hits.push({ path: p, kind: 'credential', redacted: redact(m) });
      }
      const isPlaceholderField = PLACEHOLDER_KEY_RE.test(leafKey(p));
      for (const m of v.match(EMAIL_RE) ?? []) {
        hits.push({
          path: p,
          kind: 'email',
          redacted: redact(m),
          ...(isPlaceholderField ? { placeholder: true as const } : {}),
        });
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        walk(val, p ? `${p}.${k}` : k);
      }
    }
  };

  walk(value, path);

  // One hit per path+kind is enough to act on; a page repeating an address
  // twenty times should not produce twenty findings.
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.path}|${h.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Nav items and CTAs can point at pages the template does not carry. Not an
 * identity issue — a completeness one — but the same class of thing a caller
 * only discovers after installing: the export of the Restagård site linked to
 * /docs, which exists on the demo and nowhere else.
 */
export function findBrokenNavTargets(template: Record<string, unknown>): Array<{ label: string; url: string }> {
  const pages = Array.isArray(template.pages) ? (template.pages as Array<Record<string, unknown>>) : [];
  const slugs = new Set(pages.map((p) => `/${String(p.slug ?? '').replace(/^\//, '')}`));
  slugs.add('/');

  const header = template.headerSettings as Record<string, unknown> | undefined;
  const items = Array.isArray(header?.customNavItems)
    ? (header!.customNavItems as Array<Record<string, unknown>>)
    : [];

  const broken: Array<{ label: string; url: string }> = [];
  for (const item of items) {
    const url = String(item.url ?? '');
    if (!url.startsWith('/')) continue; // external links are the author's business
    if (!slugs.has(url.replace(/\/$/, '') || '/')) {
      broken.push({ label: String(item.label ?? url), url });
    }
  }
  return broken;
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/**
 * Remove the origin instance's identity from a template body, in place on a
 * clone, and report everything: what went, what looks risky in what stayed, and
 * which navigation targets the template cannot satisfy.
 *
 * `strip: false` keeps identity — a legitimate choice when cloning your own
 * site to a second instance of the same organisation. The scan still runs, so
 * "I chose to keep it" and "I did not know it was there" stay distinguishable.
 */
export function applyIdentityPolicy<T extends Record<string, unknown>>(
  template: T,
  strip: boolean,
): { template: T; identity: IdentityReport } {
  const body = JSON.parse(JSON.stringify(template)) as T;
  const stripped: StrippedField[] = [];

  if (strip) {
    for (const field of IDENTITY_FIELDS) {
      if (!isPresent(getPath(body, field.path))) continue;
      if (deletePath(body, field.path)) stripped.push({ path: field.path, why: field.why });
    }
  }

  const possible_secrets = scanForSecrets(body);
  const broken_nav_targets = findBrokenNavTargets(body);

  const note = strip
    ? stripped.length
      ? `Removed ${stripped.length} field(s) that identify the origin instance. The installed site supplies its own — set them after install. Pass strip_identity=false to keep them (cloning your own site to a second instance of the same organisation).`
      : 'Nothing to remove — this body carried no origin identity in the known fields.'
    : 'strip_identity=false: the origin instance\'s name, contact details, agent prompts and endpoints are INCLUDED. Installing this elsewhere makes the new site introduce itself as the origin.';

  return {
    template: body,
    identity: { stripped, kept_identity: !strip, possible_secrets, broken_nav_targets, note },
  };
}
