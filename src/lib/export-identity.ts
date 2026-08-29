/**
 * Which legal entity an accounting export claims to be.
 *
 * The bug (2026-08-30): the SIE exporter read `site_name` and `org_number` as
 * COLUMNS on `site_settings`, which is a key/value store. PostgREST answered
 * 400, the error was discarded, and the fallback shipped the customer's
 * bookkeeping export under the platform's own name — "FlowWink", org number
 * null — with nothing on screen saying so. On optic the real identity sat one
 * row away the whole time: company_profile.legal_name = "Optic Tunnels
 * Networks Nordic AB", org_number = "559532-3659".
 *
 * A wrong company name in an accounting file is worse than a missing one: the
 * missing one is caught by whoever imports it, the wrong one is imported. So
 * this returns empty rather than inventing a name, and says it is incomplete
 * so the caller can warn.
 */
export interface ExportIdentity {
  name: string;
  org_number: string | null;
  /** false when the profile could not supply a legal entity — the caller should say so. */
  complete: boolean;
}

export function resolveExportIdentity(companyProfile: unknown): ExportIdentity {
  const p = (companyProfile ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  // legal_name first: an accounting export names the legal entity, not the brand.
  const name = str(p.legal_name) || str(p.company_name);
  const org = str(p.org_number);
  return { name, org_number: org || null, complete: !!name };
}
