/**
 * manage_blog_posts update new_slug: the post moves, the old URL keeps working.
 *
 * Optic, 2026-10-30: eleven rewritten posts kept slugs that named their old
 * topics, because the skill could not change one. The rename and its 301 live
 * in _shared/blog-slug-rename.ts (unit-tested here against a fake client); the
 * handler's wiring is Deno and is read as source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBlogSlug, redirectRenamedPost, normaliseBlogSlug } from '../../../supabase/functions/_shared/blog-slug-rename';
import { blogModule } from '@/lib/modules/blog-module';

type Op = { kind: string; args: unknown[] };
type Query = { table: string; ops: Op[] };

/** A PostgREST-shaped fake: every query is recorded; `answer` decides the rows. */
function fakeClient(answer: (q: Query) => unknown[], rpcAnswer: unknown = { success: true }) {
  const queries: Query[] = [];
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    queries,
    rpcs,
    from(table: string) {
      const q: Query = { table, ops: [] };
      queries.push(q);
      const builder: Record<string, unknown> = {};
      const chain = (kind: string) => (...args: unknown[]) => { q.ops.push({ kind, args }); return builder; };
      for (const m of ['select', 'eq', 'neq', 'limit', 'update', 'delete', 'in']) builder[m] = chain(m);
      builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: answer(q), error: null }).then(res, rej);
      return builder;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return { data: rpcAnswer, error: null };
    },
  };
}

const POST = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const has = (q: Query, kind: string, ...args: unknown[]) =>
  q.ops.some((o) => o.kind === kind && args.every((a, i) => JSON.stringify(o.args[i]) === JSON.stringify(a)));

describe('checkBlogSlug — normalised, and refused when another post answers there', () => {
  it('normalises to the one slug shape', () => {
    expect(normaliseBlogSlug('  AI-agenter i Praktiken! ')).toBe('ai-agenter-i-praktiken');
    expect(normaliseBlogSlug(42)).toBe('');
  });

  it('an empty slug is INVALID_INPUT, before any query', async () => {
    const db = fakeClient(() => []);
    const r = await checkBlogSlug(db, POST, 'old', '!!!');
    expect(r).toMatchObject({ ok: false, code: 'INVALID_INPUT', retryable: false });
    expect(db.queries).toHaveLength(0);
  });

  it('the current slug is unchanged — nothing to move', async () => {
    const db = fakeClient(() => []);
    expect(await checkBlogSlug(db, POST, 'same-slug', 'Same Slug')).toEqual({ ok: true, slug: 'same-slug', unchanged: true });
    expect(db.queries).toHaveLength(0);
  });

  it('a slug another post has is ALREADY_EXISTS', async () => {
    const db = fakeClient((q) => (q.table === 'blog_posts' ? [{ id: OTHER }] : []));
    const r = await checkBlogSlug(db, POST, 'old', 'taken');
    expect(r).toMatchObject({ ok: false, code: 'ALREADY_EXISTS' });
    expect(has(db.queries[0], 'eq', 'slug', 'taken')).toBe(true);
    expect(has(db.queries[0], 'neq', 'id', POST)).toBe(true);
  });

  it('a slug that is another post\'s translated address is ALREADY_EXISTS too', async () => {
    const db = fakeClient((q) => (q.table === 'content_translations' ? [{ entity_id: OTHER, locale: 'sv' }] : []));
    const r = await checkBlogSlug(db, POST, 'old', 'svensk-adress');
    expect(r).toMatchObject({ ok: false, code: 'ALREADY_EXISTS' });
    expect((r as { error?: string }).error).toMatch(/sv address/);
  });

  it('a free slug passes', async () => {
    expect(await checkBlogSlug(fakeClient(() => []), POST, 'old', 'new-topic')).toEqual({ ok: true, slug: 'new-topic', unchanged: false });
  });
});

describe('redirectRenamedPost — the 301 is the platform\'s write', () => {
  it('writes blog/<old> → blog/<new> as a 301 through manage_redirect', async () => {
    const db = fakeClient(() => []);
    const r = await redirectRenamedPost(db, POST, 'old-topic', 'new-topic');
    expect(db.rpcs).toHaveLength(1);
    expect(db.rpcs[0].fn).toBe('manage_redirect');
    expect(db.rpcs[0].args).toMatchObject({ p_action: 'create', p_from_path: 'blog/old-topic', p_to_path: 'blog/new-topic', p_status_code: 301 });
    expect(r).toMatchObject({ from: '/blog/old-topic', to: '/blog/new-topic', status_code: 301 });
  });

  it('drops a redirect FROM the new address first (the post lives there; a rename back would trip the loop guard)', async () => {
    const db = fakeClient(() => []);
    await redirectRenamedPost(db, POST, 'b', 'a');
    const drop = db.queries.find((q) => q.table === 'page_redirects' && q.ops.some((o) => o.kind === 'delete'))!;
    expect(has(drop, 'eq', 'from_path', 'blog/a')).toBe(true);
  });

  it('re-points earlier redirects into the old address — one hop, never a chain', async () => {
    const db = fakeClient((q) => (q.table === 'page_redirects' && q.ops.some((o) => o.kind === 'update') ? [{ id: 'r1' }, { id: 'r2' }] : []));
    const r = await redirectRenamedPost(db, POST, 'old', 'new');
    const repoint = db.queries.find((q) => q.table === 'page_redirects' && q.ops.some((o) => o.kind === 'update'))!;
    expect((repoint.ops.find((o) => o.kind === 'update')!.args[0] as { to_path: string }).to_path).toBe('blog/new');
    expect(has(repoint, 'eq', 'to_path', 'blog/old')).toBe(true);
    expect(r.repointed).toBe(2);
  });

  it('moves the overlay slugs that were a copy of the old one, and only those', async () => {
    const db = fakeClient((q) => (q.table === 'content_translations' ? [{ locale: 'sv' }] : []));
    const r = await redirectRenamedPost(db, POST, 'old', 'new');
    const move = db.queries.find((q) => q.table === 'content_translations')!;
    expect((move.ops.find((o) => o.kind === 'update')!.args[0] as { slug: string }).slug).toBe('new');
    expect(has(move, 'eq', 'entity', 'blog_post')).toBe(true);
    expect(has(move, 'eq', 'entity_id', POST)).toBe(true);
    expect(has(move, 'eq', 'slug', 'old')).toBe(true);
    expect(r.overlay_slugs_moved).toEqual(['sv']);
  });

  it('a refusal from manage_redirect is an error, never a silent success', async () => {
    await expect(redirectRenamedPost(fakeClient(() => [], { success: false }), POST, 'old', 'new')).rejects.toThrow(/manage_redirect refused/);
  });
});

describe('the handler: new_slug is declared, checked before the write, redirected after it', () => {
  const exec = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf8');
  const start = exec.indexOf('async function executeBlogPostsManagement(');
  const handler = exec.slice(start, exec.indexOf("if (action === 'publish')", start));

  it('new_slug is a known argument and a declared, described parameter', () => {
    expect(exec).toMatch(/const MANAGE_BLOG_POSTS_ARGS = new Set\(\[[^\]]*'new_slug'[^\]]*\]\);/);
    const seed = blogModule.skillSeeds!.find((s) => s.name === 'manage_blog_posts')!;
    const props = (seed.tool_definition as { function: { parameters: { properties: Record<string, { description?: string }> } } }).function.parameters.properties;
    expect(props.new_slug?.description).toMatch(/old URL keeps working/);
    expect(props.new_slug?.description).toMatch(/301/);
    expect(seed.instructions).toMatch(/new_slug/);
  });

  it('the collision check refuses before the row is written', () => {
    const check = handler.indexOf('await checkBlogSlug(supabase, resolvedPostId,');
    const write = handler.indexOf(".update(updates).eq('id', resolvedPostId)");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(write);
    expect(handler).toMatch(/if \(!check\.ok\) return \{ error: check\.error, code: check\.code, retryable: check\.retryable, hint: check\.hint \};/);
    expect(handler).toMatch(/updates\.slug = check\.slug;/);
  });

  it('the redirect is written after the row moved, and a failure is reported with the manual fix', () => {
    const write = handler.indexOf(".update(updates).eq('id', resolvedPostId)");
    const redirect = handler.indexOf('await redirectRenamedPost(supabase, data.id, renamedFrom, data.slug)');
    expect(redirect).toBeGreaterThan(write);
    expect(handler).toMatch(/hint: `The post moved but \/blog\/\$\{renamedFrom\} is not redirected yet: manage_redirect/);
    expect(handler).toMatch(/\{ slug: data\.slug, previous_slug: renamedFrom, redirect \}/);
  });
});
