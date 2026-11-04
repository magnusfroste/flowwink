import { describe, expect, it } from 'vitest';
import { buildJobPostingSchema, jobDescriptionHtml, jobPostingMetaFromRow, jobRowDescriptionHtml } from '@/lib/job-posting-schema';

const ctx = {
  title: 'Vi söker erfarna fibertekniker',
  descriptionHtml: '<h2>Rollen</h2><p>Skarvning, mätning och dokumentation.</p>',
  url: 'https://www.example.se/careers',
  organizationName: 'Example AB',
  organizationUrl: 'https://www.example.se',
  today: '2026-11-04',
};

describe('JobPosting from a page that declares itself a job advert', () => {
  it('carries what Google for Jobs requires, with the role as title', () => {
    const s = buildJobPostingSchema(
      { title: 'Fibertekniker', datePosted: '2026-10-26', employmentType: 'FULL_TIME', addressLocality: 'Stockholm', addressCountry: 'se' },
      ctx,
    )!;
    expect(s['@type']).toBe('JobPosting');
    expect(s.title).toBe('Fibertekniker');
    expect(s.description).toBe(ctx.descriptionHtml);
    expect(s.datePosted).toBe('2026-10-26');
    expect(s.employmentType).toBe('FULL_TIME');
    expect(s.directApply).toBe(false);
    expect(s.hiringOrganization).toMatchObject({ name: 'Example AB', sameAs: 'https://www.example.se' });
    expect(s.jobLocation).toMatchObject({ address: { addressLocality: 'Stockholm', addressCountry: 'SE' } });
    expect(s).not.toHaveProperty('validThrough');
  });

  it('falls back to the page title the caller passes when the role is not named', () => {
    const s = buildJobPostingSchema({ datePosted: '2026-10-26', addressCountry: 'SE' }, ctx)!;
    expect(s.title).toBe(ctx.title);
  });

  it('writes nothing without a date, without a place, or without a description', () => {
    expect(buildJobPostingSchema({ addressCountry: 'SE' }, ctx)).toBeNull();
    expect(buildJobPostingSchema({ datePosted: '26/10/2026', addressCountry: 'SE' }, ctx)).toBeNull();
    expect(buildJobPostingSchema({ datePosted: '2026-10-26' }, ctx)).toBeNull();
    expect(buildJobPostingSchema({ datePosted: '2026-10-26', addressCountry: 'SE' }, { ...ctx, descriptionHtml: ' ' })).toBeNull();
    expect(buildJobPostingSchema(undefined, ctx)).toBeNull();
  });

  it('a remote role needs no place and says so', () => {
    const s = buildJobPostingSchema({ datePosted: '2026-10-26', remote: true, addressCountry: 'SE' }, ctx)!;
    expect(s.jobLocationType).toBe('TELECOMMUTE');
    expect(s.applicantLocationRequirements).toMatchObject({ '@type': 'Country', name: 'SE' });
  });

  it('an expired advert is withdrawn; one still open carries its end', () => {
    expect(buildJobPostingSchema({ datePosted: '2026-10-01', validThrough: '2026-11-03', addressCountry: 'SE' }, ctx)).toBeNull();
    const open = buildJobPostingSchema({ datePosted: '2026-10-01', validThrough: '2026-11-04', addressCountry: 'SE' }, ctx)!;
    expect(open.validThrough).toBe('2026-11-04T23:59:59');
  });

  it('the description is the page: block titles as headings, bodies as rendered', () => {
    const html = jobDescriptionHtml([
      { id: 'a', type: 'text', data: { title: 'Rollen & ansvaret', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Skarvning.' }] }] } } },
      { id: 'b', type: 'separator', data: {} },
    ]);
    expect(html).toContain('<h2>Rollen &amp; ansvaret</h2>');
    expect(html).toContain('<p>Skarvning.</p>');
  });
});

describe('JobPosting from a recruitment-module posting (/jobs/<slug>)', () => {
  const row = {
    title: 'Fibertekniker',
    location: 'Stockholm',
    remote_policy: 'onsite',
    employment_type: 'contract',
    // 23:30 UTC on 31 October is 1 November in Stockholm — the business's day.
    published_at: '2026-10-31T23:30:00Z',
    created_at: '2026-10-20T08:00:00Z',
  };

  it('maps the row onto the meta: the published day in the business zone, the business country', () => {
    expect(jobPostingMetaFromRow(row, { country: 'se', timeZone: 'Europe/Stockholm' })).toEqual({
      title: 'Fibertekniker',
      datePosted: '2026-11-01',
      employmentType: 'CONTRACTOR',
      addressLocality: 'Stockholm',
      addressCountry: 'se',
      remote: false,
    });
  });

  it('falls back to created_at, and a remote role needs no place', () => {
    const meta = jobPostingMetaFromRow(
      { ...row, location: null, remote_policy: 'Remote', published_at: null },
      { timeZone: 'Europe/Stockholm' },
    );
    expect(meta.datePosted).toBe('2026-10-20');
    expect(meta.remote).toBe(true);
    const s = buildJobPostingSchema(meta, { ...ctx, directApply: true })!;
    expect(s.jobLocationType).toBe('TELECOMMUTE');
    expect(s.directApply).toBe(true);
  });

  it('writes the text as the visitor sees it: paragraphs, line breaks, headings only over a body', () => {
    const html = jobRowDescriptionHtml([
      { text: 'Vi bygger <nät>.\n\nRad ett\nrad två' },
      { heading: 'Ansvar', text: '  ' },
      { heading: 'Vi erbjuder', items: ['Tjänstebil', 'Friskvård'] },
    ]);
    expect(html).toBe('<p>Vi bygger &lt;nät&gt;.</p>\n<p>Rad ett<br>rad två</p>\n<h2>Vi erbjuder</h2>\n<ul><li>Tjänstebil</li><li>Friskvård</li></ul>');
  });
});
