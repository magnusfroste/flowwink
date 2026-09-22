import { describe, it, expect } from 'vitest';
import { groupByTag, inlineTags, normalizeTag, tagsInUse } from '@/lib/wiki-tags';

describe('a #tag written in the page', () => {
  it('is a word after a line start, whitespace or a bracket — not a heading, colour or anchor', () => {
    expect(inlineTags('# Rubriken\n\nfärgen #fff och sida.html#avsnitt\n\n#Sälj #tisdagsmöte-v38 (#möte)'))
      .toEqual(['möte', 'sälj', 'tisdagsmöte-v38']);
    expect(inlineTags('#1a2b3c #123 #_x')).toEqual([]);
    expect(inlineTags('')).toEqual([]);
  });
  it('normalises what a person types', () => {
    expect(normalizeTag('  #Möte ')).toBe('möte');
    expect(normalizeTag('##sälj')).toBe('sälj');
  });
});

describe('grouping', () => {
  const page = (slug: string, all_tags: string[], updated_at: string) => ({ slug, title: slug, all_tags, updated_at });
  const pages = [
    page('v37', ['tisdagsmöte', 'möte'], '2026-09-08'),
    page('v38', ['tisdagsmöte', 'möte', 'sälj'], '2026-09-15'),
    page('v39', ['tisdagsmöte', 'möte'], '2026-09-22'),
    page('Produkt', ['produkt'], '2026-08-21'),
    page('Loose', [], '2026-09-01'),
  ];

  it('one group per tag, biggest first, newest first inside — a series reads itself', () => {
    const groups = groupByTag(pages);
    expect(groups.map((g) => g.label)).toEqual(['möte', 'tisdagsmöte', 'produkt', 'sälj', 'Untagged']);
    expect(groups[0].pages.map((p) => p.slug)).toEqual(['v39', 'v38', 'v37']);
  });
  it('a page with two tags appears under both — a label, not a folder', () => {
    const groups = groupByTag(pages);
    expect(groups.find((g) => g.tag === 'sälj')?.pages.map((p) => p.slug)).toEqual(['v38']);
    expect(groups.find((g) => g.tag === 'möte')?.pages.map((p) => p.slug)).toContain('v38');
  });
  it('untagged pages are named at the end, not lost at a root', () => {
    expect(groupByTag(pages).at(-1)).toMatchObject({ tag: null, label: 'Untagged' });
    expect(groupByTag(pages).at(-1)?.pages.map((p) => p.slug)).toEqual(['Loose']);
  });
  it('a chip narrows to one group, without the untagged tail', () => {
    const only = groupByTag(pages, 'produkt');
    expect(only.map((g) => g.label)).toEqual(['produkt']);
  });
  it('tags in use come most used first', () => {
    expect(tagsInUse(pages).slice(0, 2)).toEqual([{ tag: 'möte', count: 3 }, { tag: 'tisdagsmöte', count: 3 }]);
  });
});
