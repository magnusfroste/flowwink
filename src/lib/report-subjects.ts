/**
 * Where a report's subject lives in the admin — so a report about a company,
 * a deal or a project is shown on that page, and the report links back.
 * subject_type is free text (publish_report documents company, deal, project,
 * contact, fiscal_year, period); a type without a page has no link.
 */
export const SUBJECT_PAGES: Record<string, (id: string) => string> = {
  company: (id) => `/admin/companies/${id}`,
  deal: (id) => `/admin/deals/${id}`,
  project: (id) => `/admin/projects?project=${id}`,
  contact: (id) => `/admin/leads/${id}`,
};

export function subjectHref(type: string | null | undefined, id: string | null | undefined): string | null {
  if (!type || !id) return null;
  const page = SUBJECT_PAGES[type.trim().toLowerCase()];
  return page ? page(encodeURIComponent(id)) : null;
}

/** The labels shown for a subject ("Company", "Fiscal year"). */
export function subjectLabel(type: string): string {
  const t = type.trim().toLowerCase().replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
