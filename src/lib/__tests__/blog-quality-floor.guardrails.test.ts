/**
 * The floor is wired where the post is written, not only described in the
 * prompt — and the pieces around it (the image query, the angle, the audit,
 * inline images) stay in place. Source-reading guard.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blogModule } from '@/lib/modules/blog-module';
import { markdownToTiptap } from '../../../supabase/functions/_shared/markdown-to-tiptap.ts';
import { renderToHtml, renderToMarkdown } from '@/lib/tiptap-utils';
import { normalizeContentAngles, normalizeClaimsToAvoid, normalizeCompanyProfileShapes } from '@/lib/company-profile-shapes';
import { composeIdentityBlock } from '../../../supabase/functions/_shared/domains/business-identity-block.ts';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const exec = read('supabase/functions/agent-execute/index.ts');

describe('write_blog_post — the floor is structure', () => {
  it('judges the body before anything is written, skips imports, and force is for a person', () => {
    expect(exec).toMatch(/const refusal = assessPost\(\{\n\s+title: resolvedTitle,/);
    expect(exec).toMatch(/if \(!isImport && force !== true\) \{/);
    expect(exec).toMatch(/if \(refusal\) return refusal;/);
    // The error classifier knows the four codes as refusals.
    const errs = read('supabase/functions/_shared/agent-errors.ts');
    for (const c of ['CONTENT_TOO_THIN', 'LANGUAGE_MISMATCH', 'DUPLICATE_CONTENT', 'FORBIDDEN_CLAIM']) expect(errs).toContain(`'${c}'`);
  });
  it('never sends the brief to the photo search; the alt is the title', () => {
    expect(exec).not.toMatch(/findUnsplashPhoto\(topic \|\| resolvedTitle/);
    expect(exec).toMatch(/imageQueryFor\(resolvedTitle, typeof profile\.industry === 'string' \? profile\.industry : null\)/);
    expect(exec).toMatch(/featuredImageAlt = featuredImageAlt \|\| altTextFor\(resolvedTitle\)/);
  });
  it('a rewritten body (manage_blog_posts update) meets the same floor', () => {
    const i = exec.indexOf("if (action === 'update') {\n    if (!resolvedPostId) throw new Error('post_id or slug required for update');");
    expect(i).toBeGreaterThan(0);
    expect(exec.slice(i, i + 4000)).toMatch(/assessPost\(\{[\s\S]*existing: \[\],/);
  });
  it('the skills declare what the handler reads: image_query, angle, force; and audit_blog exists', () => {
    const seeds = blogModule.skillSeeds!;
    const w = seeds.find((s) => s.name === 'write_blog_post')!;
    const props = (w.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties;
    for (const k of ['image_query', 'angle', 'force']) expect(props, k).toHaveProperty(k);
    expect(w.description).toMatch(/REFUSED/);
    expect(w.instructions).toMatch(/CONTENT_TOO_THIN/);
    const m = seeds.find((s) => s.name === 'manage_blog_posts')!;
    expect((m.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties).toHaveProperty('force');
    const a = seeds.find((s) => s.name === 'audit_blog')!;
    expect(a.handler).toBe('module:blog');
    expect(a.description).toMatch(/Use when:/);
    expect(a.description).toMatch(/NOT for:/);
    expect(exec).toMatch(/if \(skillName === 'audit_blog'\) \{/);
    expect(exec).toMatch(/duplicate_clusters: clusters,/);
  });
  it('the heartbeat protocol says one thesis, the open angle, and that a refusal is not retried', () => {
    const pc = read('supabase/functions/_shared/pilot/prompt-compiler.ts');
    expect(pc).toMatch(/next OPEN content angle/);
    expect(pc).toMatch(/A refusal \(CONTENT_TOO_THIN, DUPLICATE_CONTENT, LANGUAGE_MISMATCH, FORBIDDEN_CLAIM\) is not an error to retry/);
  });
});

describe('a picture in the body', () => {
  it('an image on its own line is an image node; inside a sentence it stays a link; unsafe srcs stay text', () => {
    const doc = markdownToTiptap('Intro\n\n![Where the data goes](https://cdn.example/x.png)\n\nSee ![inline](https://cdn.example/y.png) here\n\n![bad](javascript:alert(1))');
    expect(doc.content[1]).toEqual({ type: 'image', attrs: { src: 'https://cdn.example/x.png', alt: 'Where the data goes' } });
    expect(doc.content[2].type).toBe('paragraph');
    expect(JSON.stringify(doc.content[2])).toContain('"href":"https://cdn.example/y.png"');
    expect(doc.content[3].type).toBe('paragraph');
    expect(JSON.stringify(doc)).not.toContain('javascript:');
  });
  it('the public renderer draws the editor\'s image node and refuses a src that is not http(s) or a path', () => {
    const html = renderToHtml({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'image', attrs: { src: 'https://cdn.example/x.png', alt: 'A "quoted" alt', width: 480, align: 'right' } },
      { type: 'image', attrs: { src: 'data:image/png;base64,AAAA', alt: 'x' } },
      { type: 'image', attrs: { src: '/media/own.jpg', alt: '' } },
    ] });
    expect(html).toContain('<img src="https://cdn.example/x.png" alt="A &quot;quoted&quot; alt" style="width: 480px; max-width: 100%; height: auto;" loading="lazy">');
    expect(html).toContain('style="text-align: right"');
    expect(html).not.toContain('data:image');
    expect(html).toContain('<img src="/media/own.jpg"');
    // Before 2026-10-28 this threw and the WHOLE body rendered empty.
    expect(html.startsWith('<p>a</p>')).toBe(true);
    expect(renderToMarkdown({ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://x/y.png', alt: 'y' } }] })).toBe('![y](https://x/y.png)\n\n');
  });
});

describe('the identity carries the editorial plan and the ruled-out claims', () => {
  it('normalises angles and claims in both runtimes the same way', () => {
    const angles = normalizeContentAngles(['Bara en tes', { thesis: 'T', audience: 'CIO', proof: 'wiki/x', covered_by: 'slug-1' }, { description: 'no thesis' }]);
    expect(angles).toHaveLength(2);
    expect(angles[1]).toMatchObject({ thesis: 'T', audience: 'CIO', proof: 'wiki/x', covered_by: 'slug-1' });
    expect(normalizeClaimsToAvoid('- 100 % datakontroll\ngaranterar säkerhet; Garanterar Säkerhet')).toEqual(['100 % datakontroll', 'garanterar säkerhet']);
    const p = normalizeCompanyProfileShapes({ content_angles: 'x', claims_to_avoid: ['a b'] });
    expect(Array.isArray(p.content_angles)).toBe(true);
    const edge = read('supabase/functions/_shared/handlers/company-profile.ts');
    expect(edge).toMatch(/if \("content_angles" in next\) next\.content_angles = normalizeContentAngles/);
    expect(edge).toMatch(/if \("claims_to_avoid" in next\) next\.claims_to_avoid = normalizeClaimsToAvoid/);
  });
  it('the narrative block lists OPEN angles first and WRITTEN ones with their slug; claims to avoid are a rule in both depths', () => {
    const map = { company_profile: {
      company_name: 'Autoversio AB', services: [{ name: 'Trust zone', description: 'x' }],
      content_angles: [{ id: 'a1', thesis: 'Written one', covered_by: 'written-one' }, { id: 'b2', thesis: 'Open one', audience: 'CIO', proof: 'wiki/loggflode' }],
      claims_to_avoid: ['100 % datakontroll'],
    } };
    const wide = composeIdentityBlock(map, 'narrative').block;
    expect(wide.indexOf('OPEN [angle b2]: Open one — for: CIO — proof: wiki/loggflode')).toBeLessThan(wide.indexOf('WRITTEN (/blog/written-one) [angle a1]: Written one'));
    expect(wide).toMatch(/Claims the company has ruled out[^\n]*"100 % datakontroll"/);
    const core = composeIdentityBlock(map, 'core').block;
    expect(core).not.toContain('Content angles');
    expect(core).toMatch(/Claims the company has ruled out/);
  });
});
