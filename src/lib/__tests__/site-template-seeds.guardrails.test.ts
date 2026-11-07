import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The edge half of #173: a website becomes something an agent can author.
 *
 * The storage half (site_templates + manage_site_template + the structure
 * report) landed in #171. These are the three seeds that make it reachable —
 * and the loop only closes if all of them exist: the RPC needs a skill with the
 * guide in its instructions, the composer needs a block vocabulary to ask
 * (describe_blocks), and the installer must accept a template that was authored
 * here rather than shipped with the product.
 */

const templatesModule = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/templates-module.ts'), 'utf-8');
const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/execute/core.ts'), 'utf-8');
const guideDoc = readFileSync(
  resolve(__dirname, '../../../docs/architecture/site-template-authoring.md'), 'utf-8');

const seed = templatesModule.slice(
  templatesModule.indexOf("name: 'manage_site_template'"),
  templatesModule.indexOf("name: 'install_template'"));

describe('manage_site_template carries the composition guide', () => {
  it('is the rpc the storage half exposes', () => {
    expect(seed).toMatch(/handler: 'rpc:manage_site_template'/);
    expect(seed).toMatch(/trust_level: 'notify'/);
  });

  it('its params match the function, so the self-correcting hint stays accurate', () => {
    for (const p of ['action', 'template', 'name', 'description', 'category', 'icon', 'tagline', 'template_json', 'is_active']) {
      expect(seed).toContain(`${p}: {`);
    }
  });

  it('the description sends the agent to the instructions BEFORE composing', () => {
    expect(seed).toMatch(/read_skill \/ skill_read/);
    expect(seed).toMatch(/describe_blocks/);
  });

  it('and warns that a refused write is reported in validation, not thrown away silently', () => {
    expect(seed).toMatch(/non-empty errors list means the write was REFUSED/);
  });

  it('carries the guide verbatim from the design doc — one text, not a paraphrase', () => {
    // The doc is where the guide is written and reviewed; the seed must not
    // drift from it. Spot-check the load-bearing lines.
    for (const line of [
      'THE SITE COMPOSITION GUIDE',
      'STEP 0, GATHER CONTEXT FIRST',
      'never guess a field name',
      'PAGE RECIPES',
      'WHAT BELONGS WHERE',
    ]) {
      const inDoc = guideDoc.includes(line.replace('never guess a field name', 'Never guess a field name'))
        || guideDoc.includes(line);
      expect(inDoc, `${line} missing from the design doc`).toBe(true);
      expect(seed.toLowerCase()).toContain(line.toLowerCase());
    }
  });

  it('teaches the Tiptap rule — the error that saves fine and renders nothing', () => {
    expect(seed).toMatch(/MUST be JSON objects/);
    expect(seed).toMatch(/never strings/);
  });
});

describe('install_template accepts a template authored here', () => {
  const fn = agentExecute.slice(agentExecute.indexOf('async function tplInstall'));

  it('falls back to site_templates when the id is not in the bundled catalog', () => {
    // Anchor on the RESOLUTION query specifically. A looser /site_templates/
    // match passes on the error-message listing query further down, which is
    // not the code path that makes an authored template installable.
    expect(fn).toMatch(/const q = supabase\.from\('site_templates'\)\.select\('id, name, template_json'\)\.eq\('is_active', true\)/);
  });

  it('resolves by UUID or by name, without an .or() that breaks on non-uuid input', () => {
    expect(fn.slice(0, 3000)).toMatch(/isUuid/);
    expect(fn.slice(0, 3000)).toMatch(/\.ilike\('name', templateId\)/);
  });

  it('gives the stored row the shape the installer already expects', () => {
    // template.id / template.name feed the installed_template manifest.
    expect(fn.slice(0, 3000)).toMatch(/id: stored\.id, name: stored\.name/);
  });

  it('an unknown id answers with BOTH lists — catalog and authored', () => {
    expect(fn.slice(0, 4000)).toMatch(/stored_templates:/);
    expect(fn.slice(0, 4000)).toMatch(/available_templates: Object\.keys\(TEMPLATE_MAP\)/);
  });

  it('reports which source was installed — a demo and the customer’s own template are not the same event', () => {
    expect(fn).toMatch(/template_source: storedTemplateSource \?\? 'catalog'/);
  });

  it('the seed tells the agent the loop exists', () => {
    const install = templatesModule.slice(templatesModule.indexOf("name: 'install_template'"));
    expect(install.slice(0, 2500)).toMatch(/OR one authored on this instance/);
    expect(install.slice(0, 2500)).toMatch(/closes the authoring loop/);
  });
});
