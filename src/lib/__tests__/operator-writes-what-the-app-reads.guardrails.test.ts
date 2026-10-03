import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOCK_CONTRACTS,
  normalizeBlockData,
  validateBlockData,
} from '../../../supabase/functions/_shared/normalize-blocks';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

/**
 * An external operator (Hermes building synclairvision, 2026-10-03) sees three
 * things: the skill's declared parameters, describe_blocks, and what the page
 * then shows. Where those disagree it either gets refused for a correct call or
 * writes a field nothing reads — and both look like "the platform is flaky".
 *
 *   - manage_blog_posts update had no body parameter → delete + rewrite to fix a typo
 *   - site_branding_update knew one logo and one primary → black-on-black in dark theme
 *   - the youtube write contract required videoId, the catalogue url, the renderer reads url
 *
 * These guards scan the handlers and contracts rather than naming the three
 * cases: a destructured argument the skill does not declare, a branding key the
 * app does not read, a contract field the catalogue does not list.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const edge = read('supabase/functions/agent-execute/index.ts');

type Seed = { name: string; handler: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
const skills = new Map(artifact.modules.flatMap((m) => m.skills).map((s) => [s.name, s]));
const declared = (name: string) => Object.keys(skills.get(name)?.tool_definition.function.parameters.properties ?? {});

/** `const { a, b = 1, c: d } = args as any;` → ['a', 'b', 'c'] (the names READ from args). */
function destructuredArgs(body: string): string[] {
  const m = body.match(/const \{([^}]*)\} = args as (?:any|\{[^}]*\})/);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim().split(/[:=\s]/)[0]).filter((s) => s && !s.startsWith('_'));
}

describe('a skill handler reads only the parameters its definition declares', () => {
  // Every `if (skillName === 'x') { … const {…} = args as any` branch in agent-execute.
  const branches = [...edge.matchAll(/if \(skillName === '([a-z_]+)'\) \{\n([\s\S]{0,600}?)\n/g)];

  it('finds the branches it audits', () => {
    expect(branches.length).toBeGreaterThan(20);
    expect(branches.some(([, name]) => name === 'site_branding_update')).toBe(true);
  });

  it('every destructured argument is a declared parameter', () => {
    const offenders: string[] = [];
    for (const [, name, body] of branches) {
      const skill = skills.get(name);
      // Only branches the dispatcher reaches: an rpc:/edge:/ai-task: skill never
      // enters agent-execute's db:/module: switch, so a branch left behind under
      // its name (support_assign_conversation) is dead code, not a contract.
      if (!skill || !/^(db|module|internal):/.test(skill.handler)) continue;
      const props = declared(name);
      for (const arg of destructuredArgs(body)) if (!props.includes(arg)) offenders.push(`${name}.${arg}`);
    }
    expect(offenders).toEqual([]);
  });

  it('manage_blog_posts declares what its update path writes, body included', () => {
    const start = edge.indexOf('async function executeBlogPostsManagement(');
    const body = edge.slice(start, edge.indexOf('if (action ===', start));
    const args = destructuredArgs(body);
    expect(args).toContain('content');
    expect(args).toContain('content_json');
    for (const a of args) expect(declared('manage_blog_posts'), a).toContain(a);
    // and the body goes through the same conversion as write_blog_post
    const update = edge.slice(start, edge.indexOf("if (action === 'publish')", start));
    expect(update).toMatch(/updates\.content_json = markdownToTiptap\(content\)/);
  });
});

describe('site_branding_update writes only keys the app reads, and reads both themes', () => {
  const start = edge.indexOf("if (skillName === 'site_branding_update')");
  const handler = edge.slice(start, edge.indexOf("const { action = 'update', key, value } = args as any;", start));
  const iface = read('src/hooks/useSiteSettings.tsx');
  const ifaceBody = iface.slice(iface.indexOf('export interface BrandingSettings {'), iface.indexOf('export const defaultBrandingSettings'));
  const appKeys = [...ifaceBody.matchAll(/^\s{2}(\w+)\?:/gm)].map((m) => m[1]);

  it('every key the handler writes is a BrandingSettings key', () => {
    const written = [...new Set([...handler.matchAll(/updated\.(\w+) =/g)].map((m) => m[1]))];
    expect(written.length).toBeGreaterThan(5);
    expect(written.filter((k) => !appKeys.includes(k))).toEqual([]);
  });

  it('the dark theme can be set: logoDark and primaryColorDark are writable', () => {
    for (const k of ['logoDark', 'primaryColorDark', 'headingFont', 'bodyFont']) expect(handler).toMatch(new RegExp(`updated\\.${k} =`));
  });

  it('merges into the existing branding instead of replacing it', () => {
    expect(handler).toMatch(/\{ \.\.\.\(existing\?\.value \|\| \{\}\) \}/);
  });
});

describe('the write contract and the catalogue agree on what a block needs', () => {
  const byType = new Map(BLOCK_REFERENCE.map((b) => [b.type, b]));

  it('every field a contract requires is a field the catalogue lists', () => {
    const offenders: string[] = [];
    for (const [type, contract] of Object.entries(BLOCK_CONTRACTS)) {
      const ref = byType.get(type);
      if (!ref) continue;
      const names = ref.fields.map((f) => f.name);
      for (const group of contract.required) for (const f of group) if (!names.includes(f)) offenders.push(`${type}.${f}`);
    }
    expect(offenders).toEqual([]);
  });

  it('a field the contract alone requires is one the catalogue marks required', () => {
    // The youtube shape: the gate demanded videoId, the catalogue said videoId
    // was optional and url required — so following describe_blocks got refused.
    const offenders: string[] = [];
    for (const [type, contract] of Object.entries(BLOCK_CONTRACTS)) {
      const ref = byType.get(type);
      if (!ref) continue;
      for (const group of contract.required) {
        if (group.length !== 1) continue;
        const field = ref.fields.find((f) => f.name === group[0]);
        if (field && !field.required) offenders.push(`${type}.${group[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a youtube block passes with url, or with videoId, and never with neither', () => {
    expect(validateBlockData('youtube', { url: 'https://youtu.be/dQw4w9WgXcQ' }).valid).toBe(true);
    expect(validateBlockData('youtube', { videoId: 'dQw4w9WgXcQ' }).valid).toBe(true);
    const neither = validateBlockData('youtube', { title: 'x' });
    expect(neither.valid).toBe(false);
    expect(neither.errors.join(' ')).toMatch(/"url" \| "videoId"/);
  });

  it('videoId is stored under the name the renderer reads', () => {
    const block = { type: 'youtube', data: { videoId: 'dQw4w9WgXcQ', title: 't' } } as Record<string, unknown>;
    normalizeBlockData(block);
    expect(block.data).toEqual({ url: 'dQw4w9WgXcQ', title: 't' });
    const renderer = read('src/components/public/blocks/YouTubeBlock.tsx');
    expect(renderer).toMatch(/data\.url/);
    expect(renderer).not.toMatch(/data\.videoId/);
  });
});
