import { describe, it, expect } from 'vitest';
import { flowwinkPlatformTemplate } from '@/data/templates/flowwink-platform';
import { defaultModulesSettings } from '@/hooks/useModules';

/**
 * The flowwink-platform template IS the full-platform showcase — the template
 * www.flowwink.com itself runs on. Two properties define it, and both have
 * silently regressed before:
 *
 * 1. CONTENT: a 2026-06-04 bulk commit dropped exactly four lines — the
 *    imports and attachments of flowwinkBlogPosts/flowwinkKbCategories. Every
 *    other template kept seeding its content; only this one went quiet. Nobody
 *    noticed until a fresh install two months later had an empty Blog nav.
 *
 * 2. MODULES: the requiredModules list was hand-trimmed in the era when
 *    enabling a module implied edge-function slots (the 100-function cap).
 *    Since the edge-surface refactor, module toggles cost skills rows and nav
 *    only — the showcase should enable EVERYTHING, and a newly shipped module
 *    must not silently miss it.
 */

describe('flowwink-platform is the full showcase', () => {
  it('enables every module in the registry (minus deprecated)', () => {
    const allModules = Object.keys(defaultModulesSettings).filter(
      (id) => id !== 'globalElements', // deprecated — merged into pages
    );
    const required = new Set(flowwinkPlatformTemplate.requiredModules ?? []);
    const missing = allModules.filter((id) => !required.has(id as never));
    expect(
      missing,
      `New module(s) not enabled by the platform showcase template: ${missing.join(', ')} — add them to requiredModules in flowwink-platform.ts`,
    ).toEqual([]);
  });

  it('declares no unknown or deprecated module ids', () => {
    const known = new Set(Object.keys(defaultModulesSettings));
    const unknown = (flowwinkPlatformTemplate.requiredModules ?? []).filter(
      (id) => !known.has(id) || id === 'globalElements',
    );
    expect(unknown, `Unknown/deprecated module ids in requiredModules: ${unknown.join(', ')}`).toEqual([]);
  });

  it('seeds the FlowWink blog (the BOS marketing posts, not generic demo data)', () => {
    expect(flowwinkPlatformTemplate.blogPosts?.length ?? 0).toBeGreaterThanOrEqual(10);
    const titles = (flowwinkPlatformTemplate.blogPosts ?? []).map((p) => p.title).join(' | ');
    expect(titles).toMatch(/FlowPilot/);
  });

  it('seeds the knowledge base categories', () => {
    expect(flowwinkPlatformTemplate.kbCategories?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
