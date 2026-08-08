import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * "Save the live site as a template."
 *
 * Templates had import and export, and the export landed nowhere: it handed
 * back JSON that whoever wanted to keep it had to feed into
 * manage_site_template by hand. Invisible until an agent built a site over MCP
 * — having just authored nine pages, saving them meant transcribing its own
 * work through a second skill.
 *
 * The fix belongs in export_site_template, not in a new verb: three other skill
 * descriptions already point at THIS name for "export the current site", and a
 * surface with two words for one job grows two half-working generations. These
 * tests hold that line as much as they hold the feature.
 */

const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf-8');
const templatesModule = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/templates-module.ts'), 'utf-8');
const revertMigration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260809100000_revert-site-template-capture.sql'), 'utf-8');

const handler = agentExecute.slice(
  agentExecute.indexOf('async function tplExportSite'),
  agentExecute.indexOf('async function executeTemplatesAction'));
const seed = templatesModule.slice(
  templatesModule.indexOf("name: 'export_site_template'"),
  templatesModule.length);

describe('save_as closes the loop', () => {
  it('stores the export instead of only returning it', () => {
    expect(handler).toMatch(/const saveAs = typeof a\.save_as === 'string'/);
    expect(handler).toMatch(/supabase\.rpc\('manage_site_template'/);
  });

  it('is idempotent on the name — an existing template is updated, never duplicated', () => {
    expect(handler).toMatch(/\.from\('site_templates'\)\.select\('id, template_json'\)\.ilike\('name', saveAs\)/);
    expect(handler).toMatch(/p_action: existing \? 'update' : 'create'/);
  });

  it('writes NOTHING without save_as — a preview must stay a preview', () => {
    expect(handler).toMatch(/if \(saveAs\) \{/);
    expect(handler).toMatch(/Nothing was written — this is a preview/);
  });

  it('a narrower re-export says what it REMOVED from the stored template', () => {
    // Caught live: re-saving without `include` turned 12 stored products into 0.
    // Replace is what update means — but a caller who is not told cannot notice.
    expect(handler).toMatch(/removed_from_stored_template/);
    expect(handler).toMatch(/An update REPLACES the stored body/);
    expect(handler).toMatch(/had > 0 && now === 0/);
  });

  it('a refused save says so instead of reporting success with no row', () => {
    // The envelope-lie class: honest-looking status, nothing stored.
    expect(handler).toMatch(/Export succeeded but the save was refused/);
    expect(handler).toMatch(/success: false/);
  });
});

describe('validation has ONE home — the one the write enforces', () => {
  it('calls the database structure report rather than reimplementing it', () => {
    expect(handler).toMatch(/\.rpc\('_site_template_structure_report'/);
  });

  it('and the local copy of the rules is gone', () => {
    // There used to be a hand-rolled mirror of validateTemplate here. Three
    // copies of one ruleset is how a preview starts disagreeing with a refusal.
    expect(handler).not.toMatch(/errors\.push\('Template must have at least one page'\)/);
    expect(handler).not.toMatch(/does not match any page/);
  });

  it('a validation failure is reported as a failure, not silently swallowed', () => {
    expect(handler).toMatch(/Could not validate: \$\{reportError\?\.message/);
  });
});

describe('an omitted section never reads as an empty one', () => {
  it('KB and products are opt-in, and their absence is counted and explained', () => {
    expect(handler).toMatch(/include\.includes\('kb'\)/);
    expect(handler).toMatch(/include\.includes\('products'\)/);
    expect(handler).toMatch(/section: 'KB articles', count, how: 'Add "kb" to include\.'/);
    expect(handler).toMatch(/section: 'products', count, how: 'Add "products" to include\.'/);
  });

  it('drafts are excluded on purpose, and the reason is given', () => {
    expect(handler).toMatch(/section: 'draft pages'/);
    expect(handler).toMatch(/has not been approved for anyone to see/);
  });

  it('the default carries pages and blog — the same content export always carried', () => {
    expect(handler).toMatch(/: \['pages', 'blog'\]/);
  });
});

describe('the images are referenced, and it says so', () => {
  it('counts absolute image URLs and groups them by host', () => {
    expect(handler).toMatch(/absolute_image_urls: assetCount/);
    expect(handler).toMatch(/hosts: Object\.entries\(assetHosts\)/);
  });

  it('names the consequence rather than reporting a bare number', () => {
    expect(handler).toMatch(/keep resolving to their current host/);
  });
});

describe('one verb, not two', () => {
  it('the capture detour into manage_site_template is reverted', () => {
    expect(revertMigration).toMatch(/DROP FUNCTION IF EXISTS public\.manage_site_template\(text, text, text, text, text, text, text, jsonb, boolean, text\[\]\)/);
    expect(templatesModule).not.toMatch(/'capture'/);
  });

  it('manage_site_template sends the agent here when a site already exists', () => {
    const authoring = templatesModule.slice(
      templatesModule.indexOf("name: 'manage_site_template'"),
      templatesModule.indexOf("name: 'export_site_template'"));
    expect(authoring).toMatch(/export_site_template save_as/);
    expect(authoring).toMatch(/do NOT transcribe it/);
  });

  it('the DESCRIPTION carries the behaviour, not only the instructions', () => {
    const desc = templatesModule.slice(
      templatesModule.indexOf('const EXPORT_SITE_TEMPLATE_DESCRIPTION'),
      templatesModule.indexOf('const TEMPLATE_SKILLS'));
    expect(desc).toMatch(/Without save_as nothing is written/);
    expect(desc).toMatch(/never reads as an empty one/);
    expect(desc).toMatch(/Use when:/);
    expect(desc).toMatch(/NOT for:/);
  });

  it('the two description copies are one constant — they cannot drift', () => {
    expect((seed.match(/description: EXPORT_SITE_TEMPLATE_DESCRIPTION/g) || []).length).toBe(2);
  });

  it('the loop is spelled out end to end in the instructions', () => {
    expect(seed).toMatch(/export_site_template save_as="Customer starter"/);
    expect(seed).toMatch(/install_template template_id="Customer starter"/);
  });
});
