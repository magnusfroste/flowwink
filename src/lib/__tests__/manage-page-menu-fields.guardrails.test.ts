import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pagesModule } from '@/lib/modules/pages-module';
import {
  MANAGE_PAGE_PARAMETERS,
  bounceManagePageArgs,
  collectPageUpdateFields,
  parseMenuFields,
} from '../../../supabase/functions/_shared/pages/manage-page-contract';

/**
 * Guardrail: manage_page update writes EXACTLY the fields it was given, and
 * menu placement (show_in_menu / menu_order) is honoured by BOTH create and
 * update.
 *
 * Observed live on restagard's instance (2026-09-09):
 *
 *   { "action": "update", "slug": "gris", "show_in_menu": false }  → "updated"
 *
 * and the row kept show_in_menu = true. The handler read four names (title,
 * slug, meta, blocks) and dropped every other key on the floor while answering
 * success — the silent-noop class ("updated: true, wrote {}"). Menu placement
 * was not settable at all: create ignored it too, so every agent-built page
 * landed in the header regardless of whether it was a hub or one of its
 * sub-pages.
 *
 * What this file pins:
 *   A. The seed schema and the handler's read set are the SAME set. A declared
 *      parameter nobody reads is the silence above; a read parameter the schema
 *      hides gets bounced by the transport preflight before it arrives.
 *   B. Update collects exactly the sent fields — no extras, no drops — through
 *      the declared aliases, and never rewrites a slug that was only the lookup.
 *   C. An unknown key is REFUSED with the self-correcting bounce, not ignored.
 *   D. The handler actually routes create and update through the contract.
 */

const managePage = (pagesModule.skillSeeds ?? []).find((s) => s.name === 'manage_page');
type ToolDef = { function?: { parameters?: { properties?: Record<string, { type?: string }> } } };
const PROPS = ((managePage?.tool_definition as ToolDef | undefined)?.function?.parameters?.properties ?? {});

describe('A. schema and handler read set are one set', () => {
  it('manage_page declares show_in_menu (boolean) and menu_order (integer)', () => {
    expect(managePage, 'manage_page missing from pages-module').toBeTruthy();
    expect(PROPS.show_in_menu?.type).toBe('boolean');
    expect(PROPS.menu_order?.type).toBe('integer');
  });

  it('every declared parameter is read, and every read parameter is declared', () => {
    expect(Object.keys(PROPS).sort()).toEqual(Object.keys(MANAGE_PAGE_PARAMETERS).sort());
  });

  it('the instructions tell an agent where a page belongs in the menu', () => {
    const instr = String(managePage?.instructions ?? '');
    expect(instr).toContain('show_in_menu');
    expect(instr).toContain('menu_order');
    expect(instr).toMatch(/sub-pages of a hub/i);
    expect(instr).toMatch(/show_in_menu: false/);
  });
});

describe('B. update writes exactly the fields it was given', () => {
  it('the live restagard call writes {show_in_menu:false} and nothing else', () => {
    const { fields, errors } = collectPageUpdateFields(
      { action: 'update', slug: 'gris', show_in_menu: false },
      { slugIsIdentifier: true },
    );
    expect(errors).toEqual([]);
    expect(fields).toEqual({ show_in_menu: false });
  });

  it('menu_order alone writes {menu_order}', () => {
    const { fields } = collectPageUpdateFields(
      { action: 'update', page_id: 'x', menu_order: 3 },
      { slugIsIdentifier: false },
    );
    expect(fields).toEqual({ menu_order: 3 });
  });

  it('a slug sent WITH page_id is a rename; sent alone it is only the lookup', () => {
    expect(collectPageUpdateFields(
      { action: 'update', page_id: 'x', slug: 'ny-slug' }, { slugIsIdentifier: false },
    ).fields).toEqual({ slug: 'ny-slug' });
    expect(collectPageUpdateFields(
      { action: 'update', slug: 'gris', title: 'Gris' }, { slugIsIdentifier: true },
    ).fields).toEqual({ title: 'Gris' });
  });

  it('every scalar write field is carried through its declared alias — none added, none dropped', () => {
    const blocks = [{ id: 'b', type: 'text', data: { content: { type: 'doc', content: [] } } }];
    const { fields } = collectPageUpdateFields(
      {
        action: 'update', page_id: 'x',
        title: 'T', meta_json: { seo: 1 }, content_json: blocks, show_in_menu: true, menu_order: 0,
        trace_id: 'ride-along', _approved_operation_id: 'op',
      },
      { slugIsIdentifier: false },
    );
    expect(fields).toEqual({ title: 'T', meta_json: { seo: 1 }, show_in_menu: true, menu_order: 0 });
    // The body is NOT a scalar: it reaches the row only through the
    // normalizeBlocks gate on effectiveBlocks (pinned below and by
    // landing-page-compose-retirement). Transport keys never become columns.
    expect(fields).not.toHaveProperty('content_json');
    expect(fields).not.toHaveProperty('trace_id');
    expect(fields).not.toHaveProperty('_approved_operation_id');
  });

  it('a wrong-typed menu value is refused by name, never coerced into an inversion', () => {
    expect(parseMenuFields({ show_in_menu: 'no' }).errors[0]).toContain('show_in_menu');
    expect(parseMenuFields({ menu_order: 1.5 }).errors[0]).toContain('menu_order');
    expect(parseMenuFields({ menu_order: 'top' }).errors[0]).toContain('menu_order');
    // The exact string spellings a JSON-in-a-string caller sends are fine.
    expect(parseMenuFields({ show_in_menu: 'false', menu_order: '2' }).fields).toEqual({ show_in_menu: false, menu_order: 2 });
  });
});

describe('C. an unknown key is refused with the fix, not ignored', () => {
  it('known keys plus transport keys pass', () => {
    expect(bounceManagePageArgs('manage_page', {
      action: 'update', slug: 'gris', show_in_menu: false, trace_id: 't', _approved_operation_id: 'o',
    })).toBeNull();
  });

  it('in_menu bounces and points at show_in_menu', () => {
    const bounce = bounceManagePageArgs('manage_page', { action: 'update', slug: 'gris', in_menu: false });
    expect(bounce).not.toBeNull();
    expect(bounce!.error).toContain('in_menu');
    expect(bounce!.did_you_mean.in_menu).toContain('show_in_menu');
    expect(bounce!.valid_parameters).toContain('show_in_menu');
    expect(bounce!.valid_parameters).toContain('menu_order');
    expect(bounce!.hint).toContain('read_skill');
  });
});

describe('D. the handler routes create and update through the contract', () => {
  const src = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf-8');
  const start = src.indexOf("case 'manage_page':");
  const end = src.indexOf("case 'manage_page_blocks':", start);
  const handler = src.slice(start, end);

  it('bounces unknown arguments before any branch runs', () => {
    expect(handler).toContain('bounceManagePageArgs(skillName');
    expect(handler.indexOf('bounceManagePageArgs')).toBeLessThan(handler.indexOf("if (action === 'list')"));
  });

  it('create spreads the parsed menu fields into the insert', () => {
    const create = handler.slice(handler.indexOf("if (action === 'create')"), handler.indexOf("if (action === 'update' && page_id)"));
    expect(create).toContain('parseMenuFields(');
    expect(create).toContain('...menu.fields');
  });

  it('update builds its columns from collectPageUpdateFields and reads back the menu columns', () => {
    const update = handler.slice(handler.indexOf("if (action === 'update' && page_id)"), handler.indexOf("if (action === 'publish' && page_id)"));
    expect(update).toContain('collectPageUpdateFields(');
    expect(update).toContain('...collected.fields');
    expect(update).not.toMatch(/updates\.(title|slug|meta_json|show_in_menu|menu_order)\s*=/);
    // The body still goes through the gate on the ONE resolved variable.
    expect(update).toContain('updates.content_json = effectiveBlocks;');
    expect(update).toContain("select('id, title, slug, status, show_in_menu, menu_order')");
    expect(update).toContain('updated_fields');
  });

  it('list and get return show_in_menu so an agent can verify placement', () => {
    const listAndGet = handler.slice(handler.indexOf("if (action === 'list')"), handler.indexOf("if (action === 'create')"));
    const selects = listAndGet.match(/\.select\('[^']*'\)/g) ?? [];
    expect(selects.length).toBeGreaterThanOrEqual(2);
    for (const sel of selects) expect(sel).toContain('show_in_menu');
  });
});
