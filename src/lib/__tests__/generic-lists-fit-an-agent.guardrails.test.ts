import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  carriesCutMarker, cutMarker, idDidYouMean, isFullUuid, nextOffset, parseFieldList, searchColumnsFor,
  searchOrFilter, slimListItems, uuidPrefixRange, LIST_PREVIEW_CHARS, LIST_VALUE_MAX, SEARCH_ALIASES,
} from '../../../supabase/functions/_shared/execute/list-shape';

/**
 * Guardrail: a generic list is sized for the agent that reads it.
 *
 * 2026-11-04 → 11-17, optic: Peter's Hermes paged every project task 31 times
 * to find one (a page of 50 was 58–71 KB of briefs and checklists; a page of
 * documents carried every file's extracted text), kept `f3b6fce9` of an id and
 * lost the rest (a list filter answered "invalid input syntax for type uuid",
 * a document was asked for as `b0045441-0000-0000-0000-000000000000`), and
 * looked for the search under `action: "search"`, `query` and `search_query` —
 * the name four skill schemas declare and the engine never read.
 */

const core = readFileSync('supabase/functions/_shared/execute/core.ts', 'utf8');
const list = core.slice(core.indexOf("      case 'list': {\n        const {\n          limit: sentLimit"), core.indexOf("      case 'get': {\n        if (!id) return { error: 'id is required for get action' };"));

describe('a list is a listing, not every row whole', () => {
  const brief = 'Read the signed minutes before filing. '.repeat(40);
  const checklist = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, text: `Step number ${i} of the filing`, done: false }));
  const row = { id: 'a', title: 'Register', description: brief, checklist, assigned_to: null, tags: ['legal'], estimated_hours: 0, is_done: false };

  it('cuts a long text, leaves a long structure out, and each row names what it lost', () => {
    const { items, cut } = slimListItems([row]);
    const item = items[0];
    expect(String(item.description).startsWith(brief.slice(0, LIST_PREVIEW_CHARS))).toBe(true);
    expect(String(item.description).length).toBeLessThan(LIST_PREVIEW_CHARS + 80);
    expect(item.description).toContain(cutMarker(brief.length - LIST_PREVIEW_CHARS));
    expect('checklist' in item).toBe(false);
    expect(item._cut).toEqual(['description', 'checklist']);
    expect(cut.sort()).toEqual(['checklist', 'description']);
  });

  it('keeps what is short as it is — zero and false are values, an empty column is not', () => {
    const item = slimListItems([row]).items[0];
    expect(item.title).toBe('Register');
    expect(item.tags).toEqual(['legal']);
    expect(item.estimated_hours).toBe(0);
    expect(item.is_done).toBe(false);
    expect('assigned_to' in item).toBe(false);
    expect('_cut' in slimListItems([{ id: 'b', title: 'Short' }]).items[0]).toBe(false);
  });

  it('a row with named columns has exactly those columns, empty ones included', () => {
    const item = slimListItems([{ id: 'a', assigned_to: null }], { keepNulls: true }).items[0];
    expect(item).toEqual({ id: 'a', assigned_to: null });
  });

  it('a page of fifty tasks the size optic\'s were is a fraction of what it was', () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ ...row, id: `t${i}`, completed_at: null, milestone_id: null, parent_task_id: null, due_date: null }));
    const before = JSON.stringify(page).length;
    const after = JSON.stringify(slimListItems(page).items).length;
    expect(after).toBeLessThan(before / 4);
  });

  it('the threshold sits above a title and below a brief', () => {
    expect(LIST_VALUE_MAX).toBeGreaterThanOrEqual(200);
    expect(LIST_VALUE_MAX).toBeLessThanOrEqual(400);
    expect(LIST_PREVIEW_CHARS).toBeLessThan(LIST_VALUE_MAX);
  });

  it('a preview is recognised when it comes back as a write', () => {
    const preview = String(slimListItems([row]).items[0].description);
    expect(carriesCutMarker(preview)).toBe(true);
    expect(carriesCutMarker([{ text: preview }])).toBe(true);
    expect(carriesCutMarker(brief)).toBe(false);
    expect(carriesCutMarker('We cut the budget — get returns later')).toBe(false);
    expect(carriesCutMarker(null)).toBe(false);
  });

  it('the executor slims a list, lists rows whole only when asked, and refuses a preview as a write', () => {
    expect(list).toMatch(/full === true \? \{ items: rows, cut: \[\] as string\[\] \} : slimListItems\(rows, \{ keepNulls: selected\.length > 0 \}\)/);
    expect(list).toMatch(/cut_fields: shaped\.cut/);
    expect(core).toMatch(/if \(action === 'create' \|\| action === 'update'\) \{\s+const previews = Object\.entries\(fields\)\.filter\(\(\[k, v\]\) => !k\.startsWith\('_'\) && carriesCutMarker\(v\)\)/);
  });
});

describe('a list says how many rows there are and where the next page starts', () => {
  it('names the next offset only when there is a next page', () => {
    expect(nextOffset({ offset: 0, limit: 50, returned: 50, total: 153 })).toBe(50);
    expect(nextOffset({ offset: 150, limit: 50, returned: 3, total: 153 })).toBeNull();
    expect(nextOffset({ offset: 100, limit: 50, returned: 50, total: 150 })).toBeNull();
    expect(nextOffset({ offset: 0, limit: 50, returned: 50, total: null })).toBe(50);
    expect(nextOffset({ offset: 0, limit: 50, returned: 0, total: 0 })).toBeNull();
  });

  it('the executor counts the rows and answers total, offset, limit and next_offset', () => {
    expect(list).toMatch(/\{ count: 'exact' \}/);
    expect(list).toMatch(/count: rows\.length, total: total \?\? null, offset, limit,\s+next_offset: nextOffset\(/);
  });

  it('an offset past the last row is an empty page, not a failure', () => {
    expect(list).toMatch(/error\.code === 'PGRST103'/);
    expect(list).toMatch(/items: \[\], count: 0, total: known \? Number\(known\[1\]\) : null, offset, limit, next_offset: null/);
  });

  it('"what changed since" is a lower bound on the row\'s own timestamp', () => {
    expect(list).toMatch(/\['updated_since', 'updated_at', updated_since\], \['created_since', 'created_at', created_since\]/);
    expect(list).toMatch(/query = query\.gte\(col, at\)/);
    expect(list).toMatch(/since\.updated_at \? 'updated_at' : 'created_at'/);
  });
});

describe('the caller names the columns it wants — never past what it may read', () => {
  const columns = ['id', 'title', 'status', 'description'];

  it('takes an array or a comma list, and the id rides along', () => {
    expect(parseFieldList(['title', 'status'], columns)).toEqual({ select: ['id', 'title', 'status'], unknown: [] });
    expect(parseFieldList(' title , status,title ', columns)).toEqual({ select: ['id', 'title', 'status'], unknown: [] });
    expect(parseFieldList('id,title', columns).select).toEqual(['id', 'title']);
  });

  it('a name that is not a column is named, never selected', () => {
    expect(parseFieldList(['title', 'voice_sip_password'], columns)).toEqual({ select: ['id', 'title'], unknown: ['voice_sip_password'] });
    expect(parseFieldList(['nope'], columns)).toEqual({ select: [], unknown: ['nope'] });
  });

  it('nothing that is not a plain column name reaches the select', () => {
    const sel = parseFieldList(['title', 'profiles(*)', 'a.b', '*', 'id::text'], []);
    expect(sel.select).toEqual(['id', 'title']);
    expect(sel.unknown).toEqual(['profiles(*)', 'a.b', '*', 'id::text']);
  });

  it('a select mask is the ceiling: fields are held to the masked columns', () => {
    expect(list).toMatch(/const allowed = mask \? mask\.split\(','\)\.map\(\(c\) => c\.trim\(\)\) : \(\(await schemaColumns\(\)\)\[table\] \?\? \[\]\);/);
    expect(list).toMatch(/selected\.length \? selected\.join\(', '\) : \(mask \?\? '\*'\)/);
  });
});

describe('the start of an id finds the row it belongs to', () => {
  it('eight hex characters are enough, with or without the hyphens', () => {
    expect(uuidPrefixRange('f3b6fce9')).toEqual({
      prefix: 'f3b6fce9',
      lo: 'f3b6fce9-0000-0000-0000-000000000000',
      hi: 'f3b6fce9-ffff-ffff-ffff-ffffffffffff',
    });
    expect(uuidPrefixRange('F3B6FCE9-74cb')?.lo).toBe('f3b6fce9-74cb-0000-0000-000000000000');
    expect(uuidPrefixRange('f3b6fce974')?.hi).toBe('f3b6fce9-74ff-ffff-ffff-ffffffffffff');
    expect(uuidPrefixRange('f3b6fce9-')?.prefix).toBe('f3b6fce9');
  });

  it('an id padded with zeros is the start it was padded from', () => {
    expect(uuidPrefixRange('b0045441-0000-0000-0000-000000000000')?.prefix).toBe('b0045441');
    // Zeros that belong to the id's own start are not eaten below eight characters.
    expect(uuidPrefixRange('b0045440-0000-0000-0000-000000000000')?.prefix).toBe('b0045440');
    expect(uuidPrefixRange('b0045441-7a00-0000-0000-000000000000')?.prefix).toBe('b0045441-7a');
  });

  it('any other whole id that names no row is looked up by its first half', () => {
    expect(uuidPrefixRange('ace681ae-74cb-4897-9654-a39fed57cee1')?.prefix).toBe('ace681ae-74cb');
  });

  it('too little to anchor on, or not an id at all, is no range', () => {
    for (const v of ['f3b6', 'f3b6fce', 'Peter', 'accepted', 'f3b6fce9-7-4cb', 'f3b6fce9x', '', 42, null, undefined]) {
      expect(uuidPrefixRange(v), String(v)).toBeNull();
    }
  });

  it('every id in the range starts as the prefix does', () => {
    const r = uuidPrefixRange('f3b6fce9-74')!;
    const inside = 'f3b6fce9-74cb-4897-9654-a39fed57cee1';
    const outside = 'f3b6fce9-75cb-4897-9654-a39fed57cee1';
    expect(inside >= r.lo && inside <= r.hi).toBe(true);
    expect(outside >= r.lo && outside <= r.hi).toBe(false);
    expect(isFullUuid(inside)).toBe(true);
    expect(isFullUuid(r.prefix)).toBe(false);
  });

  it('a write never acts on a guess: one candidate is named, several are listed, none says where to look', () => {
    const one = idDidYouMean('documents', 'b0045441', [{ id: 'b0045441-7a2c-4d11-9f0e-1c2d3e4f5a6b', label: 'Avtal Stokab' }], 'partial_id');
    expect(one.code).toBe('INVALID_INPUT');
    expect(one.retryable).toBe(true);
    expect(one.error).toContain('did you mean b0045441-7a2c-4d11-9f0e-1c2d3e4f5a6b ("Avtal Stokab")');
    expect(one.hint).toMatch(/Nothing was written/);
    const many = idDidYouMean('documents', 'b0045441', Array.from({ length: 6 }, (_, i) => ({ id: `b0045441-000${i}` })), 'not_found');
    expect(many.code).toBe('NOT_FOUND');
    expect(many.candidates).toHaveLength(5);
    expect(many.error).toContain('(more exist)');
    const none = idDidYouMean('documents', 'b0045441', [], 'partial_id');
    expect(none.candidates).toEqual([]);
    expect(none.error).toMatch(/no documents row starts that way/);
  });

  it('the executor resolves the start of an id only on a column the schema says is a uuid', () => {
    expect(list).toMatch(/const range = uuidPrefixRange\(val\);\s+if \(!range \|\| !\(await schemaUuidColumns\(table\)\)\.includes\(col\)\) continue;/);
    expect(list).toMatch(/query = query\.gte\(col, range\.lo\)\.lte\(col, range\.hi\)/);
    expect(list).toMatch(/id_prefix: idPrefix/);
    expect(core).toMatch(/p\?\.format === 'uuid'/);
  });

  it('a read of the one row that starts so is answered; a write is told the id to re-send', () => {
    const at = core.indexOf('const rowsStartingAs = async');
    const block = core.slice(at, core.indexOf("// A list cuts long values and marks the cut.", at));
    expect(block).toMatch(/if \(action === 'get' && candidates\.length === 1\) \{\s+idReadFrom = sentId;\s+id = candidates\[0\]\.id;/);
    expect(block).toMatch(/return \{ \.\.\.idDidYouMean\(table, sentId, candidates, 'partial_id'\), table, action \};/);
    expect(core).toMatch(/resolved_id: \{ sent: idReadFrom, id \}/);
  });
});

describe('a search is found under the name the caller reaches for', () => {
  type Seed = { name: string; handler?: string; tool_definition?: { function?: { parameters?: { properties?: Record<string, unknown> } } } };
  const artifact = JSON.parse(readFileSync('supabase/seed/module-skills.json', 'utf8')) as { modules: Array<{ skills: Seed[] }> };
  const dbSkills = artifact.modules.flatMap((m) => m.skills).filter((s) => s.handler?.startsWith('db:'));

  it('every search parameter a db: skill declares is one the list reads', () => {
    const understood = new Set<string>(['search', ...SEARCH_ALIASES]);
    const searchish = /^(search|query|q|keyword|term)(_|$)|_(search|query)$/;
    const unread = dbSkills.flatMap((s) => Object.keys(s.tool_definition?.function?.parameters?.properties ?? {})
      .filter((p) => searchish.test(p) && !understood.has(p)).map((p) => `${s.name}.${p}`));
    expect(dbSkills.length).toBeGreaterThan(50);
    expect(unread, 'a declared search parameter the generic list drops as "not a column"').toEqual([]);
  });

  it('the names Hermes tried are aliases, and an alias that is a real column stays a filter', () => {
    for (const name of ['query', 'search_query', 'q']) expect(SEARCH_ALIASES).toContain(name);
    expect(list).toMatch(/for \(const alias of SEARCH_ALIASES\)/);
    expect(list).toMatch(/if \(\(\(await schemaColumns\(\)\)\[table\] \?\? \[\]\)\.includes\(alias\)\) continue;/);
    expect(core).toMatch(/search:\s+\{ action: 'list' \}/);
  });

  it('a document is found by its title, its file, its note and what it says', () => {
    expect(core).toMatch(/documents: \['title', 'file_name', 'description', 'content_md'\]/);
    expect(core).toMatch(/project_tasks: \['title', 'description'\]/);
  });

  it('a table that declares nothing is searched by what its rows are called', () => {
    expect(searchColumnsFor(undefined, ['id', 'name', 'status'])).toEqual(['name']);
    expect(searchColumnsFor(undefined, ['id', 'title', 'subject'])).toEqual(['title', 'subject']);
    expect(searchColumnsFor(undefined, ['id', 'amount_cents'])).toEqual([]);
    expect(searchColumnsFor(['title', 'gone'], ['id', 'title'])).toEqual(['title']);
    expect(searchColumnsFor(['title', 'description'], [])).toEqual(['title', 'description']);
  });

  it('the term cannot end the filter or act as a wildcard', () => {
    expect(searchOrFilter(['title', 'description'], 'Stokab')).toBe('title.ilike."%Stokab%",description.ilike."%Stokab%"');
    expect(searchOrFilter(['title'], '50% (a,b)')).toBe('title.ilike."%50\\\\% (a,b)%"');
    expect(searchOrFilter(['title'], 'say "hi"_')).toBe('title.ilike."%say \\"hi\\"\\\\_%"');
  });
});
