/**
 * A page that IS a job advert says so in its meta (`meta_json.jobPosting`) and
 * gets a schema.org JobPosting in its head — what Google for Jobs reads.
 * Optic's /careers (2026-11-04) was a plain page: LinkedIn brought the visitors,
 * search never listed the role. Title and description come from the page
 * itself, in the language it is shown in, so the facts that are not on the
 * page (date, employment type, place) are the only ones a person sets.
 *
 * The recruitment module's /jobs/<slug> is the other home of a job advert: its
 * posting (a job_postings row) already carries every fact, so it is mapped onto
 * the same meta (jobPostingMetaFromRow) and goes through the same builder.
 */
import { renderToHtml } from '@/lib/tiptap-utils';
import { businessToday, homeTimeZone } from '@/lib/platform-fallbacks';
import { dateInZone } from '../../supabase/functions/_shared/locale/home';

export const EMPLOYMENT_TYPES = [
  'FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER',
] as const;
export type EmploymentType = typeof EMPLOYMENT_TYPES[number];

export interface JobPostingMeta {
  /** The role itself ("Fiber technician"), not the advert's headline. Falls back to the page's SEO title. Translated with the page. */
  title?: string;
  /** YYYY-MM-DD the role was first advertised. Without it no schema is written. */
  datePosted?: string;
  /** YYYY-MM-DD the advert expires. Past it the schema is withdrawn; omit for rolling hiring. */
  validThrough?: string;
  employmentType?: EmploymentType;
  addressLocality?: string;
  addressRegion?: string;
  /** ISO 3166-1 alpha-2, e.g. SE. */
  addressCountry?: string;
  /** Fully remote: no place of work. */
  remote?: boolean;
}

interface Block { id?: string; type?: string; data?: Record<string, unknown> }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The page's own text as HTML: each block's title as a heading, its body as rendered. */
export function jobDescriptionHtml(blocks: Block[] | undefined): string {
  const parts: string[] = [];
  for (const block of blocks ?? []) {
    const data = block.data ?? {};
    if (typeof data.title === 'string' && data.title.trim()) parts.push(`<h2>${escapeHtml(data.title.trim())}</h2>`);
    if (data.content && (typeof data.content === 'string' || typeof data.content === 'object')) {
      const html = renderToHtml(data.content as string | Record<string, unknown>).trim();
      if (html) parts.push(html);
    }
  }
  return parts.join('\n');
}

/** The facts of a recruitment-module posting (job_postings) that a JobPosting needs. */
export interface JobPostingRow {
  title: string;
  location?: string | null;
  remote_policy?: string | null;
  employment_type?: string | null;
  published_at?: string | null;
  created_at?: string | null;
}

/** job_postings.employment_type (employment_kind) in schema.org's vocabulary. */
const EMPLOYMENT_KIND: Record<string, EmploymentType> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
  temporary: 'TEMPORARY',
};

/**
 * A posting as the meta the builder reads. `location` is free text and goes
 * whole into addressLocality; the country is the business's own
 * (general.country) — a posting has no column for it. The posting date is the
 * day it was published on the business's calendar, not the UTC day.
 */
export function jobPostingMetaFromRow(
  row: JobPostingRow,
  opts: { country?: string | null; timeZone?: string } = {},
): JobPostingMeta {
  const posted = row.published_at || row.created_at;
  const at = posted ? new Date(posted) : null;
  return {
    title: row.title,
    datePosted: at && !Number.isNaN(at.getTime()) ? dateInZone(opts.timeZone ?? homeTimeZone(), at) : undefined,
    employmentType: row.employment_type ? EMPLOYMENT_KIND[row.employment_type] : undefined,
    addressLocality: row.location?.trim() || undefined,
    addressCountry: opts.country?.trim() || undefined,
    remote: row.remote_policy?.trim().toLowerCase() === 'remote',
  };
}

/**
 * A posting's text as HTML, in the order the page shows it. The columns are
 * plain text shown pre-wrapped, so a blank line is a paragraph and a single
 * newline a line break — what the visitor sees, not a markdown reading of it.
 */
export function jobRowDescriptionHtml(
  sections: Array<{ heading?: string; text?: string | null; items?: string[] | null }>,
): string {
  const parts: string[] = [];
  for (const { heading, text, items } of sections) {
    const body = text?.trim()
      ? text.trim().split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('\n')
      : items?.length
        ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
        : '';
    if (!body) continue;
    if (heading) parts.push(`<h2>${escapeHtml(heading)}</h2>`);
    parts.push(body);
  }
  return parts.join('\n');
}

export function buildJobPostingSchema(
  job: JobPostingMeta | null | undefined,
  ctx: {
    /** The page's SEO title — used when the meta names no role. */
    title: string;
    descriptionHtml: string;
    url?: string;
    organizationName: string;
    organizationUrl?: string;
    logo?: string;
    today?: string;
    /** The page itself takes the application (the recruitment form), not an address it names. */
    directApply?: boolean;
  },
): Record<string, unknown> | null {
  if (!job || !job.datePosted || !ISO_DATE.test(job.datePosted)) return null;
  const title = job.title?.trim() || ctx.title.trim();
  if (!title || !ctx.descriptionHtml.trim() || !ctx.organizationName.trim()) return null;
  const today = ctx.today ?? businessToday();
  const validThrough = job.validThrough && ISO_DATE.test(job.validThrough) ? job.validThrough : undefined;
  // An expired advert must leave the index, not linger as a dead listing.
  if (validThrough && validThrough < today) return null;
  const hasPlace = !!(job.addressLocality?.trim() || job.addressCountry?.trim());
  // Google requires a place of work unless the role is remote.
  if (!hasPlace && !job.remote) return null;

  const schema: Record<string, unknown> = {
    '@type': 'JobPosting',
    title,
    description: ctx.descriptionHtml,
    datePosted: job.datePosted,
    hiringOrganization: {
      '@type': 'Organization',
      name: ctx.organizationName.trim(),
      ...(ctx.organizationUrl ? { sameAs: ctx.organizationUrl } : {}),
      ...(ctx.logo ? { logo: ctx.logo } : {}),
    },
    // Google's question is whether the candidate can apply on this URL.
    directApply: ctx.directApply ?? false,
  };
  if (validThrough) schema.validThrough = `${validThrough}T23:59:59`;
  if (job.employmentType && (EMPLOYMENT_TYPES as readonly string[]).includes(job.employmentType)) {
    schema.employmentType = job.employmentType;
  }
  if (ctx.url) schema.url = ctx.url;
  if (hasPlace) {
    schema.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(job.addressLocality?.trim() ? { addressLocality: job.addressLocality.trim() } : {}),
        ...(job.addressRegion?.trim() ? { addressRegion: job.addressRegion.trim() } : {}),
        ...(job.addressCountry?.trim() ? { addressCountry: job.addressCountry.trim().toUpperCase() } : {}),
      },
    };
  }
  if (job.remote) {
    schema.jobLocationType = 'TELECOMMUTE';
    if (job.addressCountry?.trim()) {
      schema.applicantLocationRequirements = { '@type': 'Country', name: job.addressCountry.trim().toUpperCase() };
    }
  }
  return schema;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
