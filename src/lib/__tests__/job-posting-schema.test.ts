import { describe, expect, it } from 'vitest';
import { buildJobPostingSchema, jobDescriptionHtml } from '@/lib/job-posting-schema';

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
