import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONFIG_BASED_KEYS,
  composioToolkitFor,
  defaultIntegrationsSettings,
  integrationNeedsSecret,
  resolveIntegrationStatus,
  type IntegrationsSettings,
} from '@/hooks/useIntegrations';
import { defaultModulesSettings } from '@/hooks/useModules';

/**
 * "Is this integration configured?" has ONE answer, resolveIntegrationStatus.
 *
 * The Paid Growth card said "Missing: meta_ads" on every instance for the
 * module's whole life (#623): the integration declared a vault secret that no
 * edge function read and that check-secrets never probed, while the readiness
 * hook and the integrations page each kept their own hand-written list of
 * "integrations that need no secret". Three lists, three answers. These guards
 * scan rather than enumerate: every declared secret is probed, no component
 * keeps a private list, and an integration a module requires can actually be
 * satisfied.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'node_modules') srcFiles(join(dir, e.name), out); }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

const keys = Object.keys(defaultIntegrationsSettings) as (keyof IntegrationsSettings)[];

describe('every declared secret is probed', () => {
  it('check-secrets reads the env var each integration card names', () => {
    const probe = read('supabase/functions/check-secrets/index.ts');
    const probed = new Set([...probe.matchAll(/Deno\.env\.get\('([A-Z0-9_]+)'\)/g)].map((m) => m[1]));
    const unprobed = keys
      .map((k) => [k, defaultIntegrationsSettings[k].secretName] as const)
      .filter(([, s]) => s && !probed.has(s))
      .map(([k, s]) => `${k} → ${s}`);
    expect(unprobed).toEqual([]);
  });

  it('a secret-based integration is keyed in the probe result under its own key', () => {
    const probe = read('supabase/functions/check-secrets/index.ts');
    const missing = keys.filter((k) => integrationNeedsSecret(k) && !new RegExp(`^\\s+${k}: !!`, 'm').test(probe));
    expect(missing).toEqual([]);
  });
});

describe('no component keeps its own list of secret-less integrations', () => {
  it('the shape ["local_llm", "n8n", …] appears only in useIntegrations.tsx', () => {
    const SHAPE = /\[\s*'local_llm'\s*,\s*'n8n'/;
    expect(SHAPE.test("const noSecretNeeded = ['local_llm', 'n8n', 'google_analytics'];")).toBe(true);
    const offenders = srcFiles('src')
      .filter((f) => f !== 'src/hooks/useIntegrations.tsx')
      .filter((f) => SHAPE.test(read(f).replace(/\/\/.*$/gm, '')));
    expect(offenders).toEqual([]);
  });

  it('the readiness hook asks the resolver', () => {
    const hook = read('src/hooks/useModuleReadiness.tsx');
    expect(hook).toMatch(/resolveIntegrationStatus\(/);
    expect(hook).not.toMatch(/noSecretNeeded/);
  });
});

describe('a Composio-backed integration is configured by its connected account', () => {
  it('meta_ads has no secret of its own and names its toolkit', () => {
    expect(defaultIntegrationsSettings.meta_ads.secretName).toBe('');
    expect(composioToolkitFor('meta_ads')).toBe('metaads');
    expect(integrationNeedsSecret('meta_ads')).toBe(false);
    // and nothing in the edge runtime reaches for the token that used to be declared
    const offenders = srcFiles('supabase/functions').filter((f) => /META_ADS_ACCESS_TOKEN/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('resolves active only when the toolkit is connected', () => {
    const off = resolveIntegrationStatus('meta_ads', {}, {}, []);
    expect(off).toEqual({ hasKey: false, isActive: false, status: 'not_configured' });
    const on = resolveIntegrationStatus('meta_ads', {}, {}, ['gmail', 'METAADS']);
    expect(on.isActive).toBe(true);
    const disabled = resolveIntegrationStatus('meta_ads', {}, { meta_ads: { ...defaultIntegrationsSettings.meta_ads, enabled: false } }, ['metaads']);
    expect(disabled.status).toBe('disabled');
  });

  it('config-based and secret-based integrations resolve as before', () => {
    expect(CONFIG_BASED_KEYS).toContain('meta_pixel');
    expect(resolveIntegrationStatus('meta_pixel', {}, { meta_pixel: { ...defaultIntegrationsSettings.meta_pixel, config: { pixelId: '1' } } }).isActive).toBe(true);
    expect(resolveIntegrationStatus('openai', { openai: true }, {}).isActive).toBe(true);
    expect(resolveIntegrationStatus('openai', { openai: false }, {}).isActive).toBe(false);
  });
});

describe('a module requires only what can be satisfied', () => {
  it('every requiredIntegrations key is an integration the resolver knows', () => {
    // optionalIntegrations is not held to this: shipping lists its carriers
    // (postnord, dhl, bring) there, and they are not registry integrations —
    // a separate finding, not this guard's.
    const offenders: string[] = [];
    for (const [moduleId, cfg] of Object.entries(defaultModulesSettings)) {
      for (const k of cfg.requiredIntegrations ?? []) {
        if (!(k in defaultIntegrationsSettings)) offenders.push(`${moduleId} → ${k} (unknown integration)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('paidGrowth requires nothing and offers Meta Ads + Composio as optional', () => {
    expect(defaultModulesSettings.paidGrowth.requiredIntegrations ?? []).toEqual([]);
    expect(defaultModulesSettings.paidGrowth.optionalIntegrations).toEqual(expect.arrayContaining(['meta_ads', 'composio']));
  });
});

describe('the ad ledger has a feed', () => {
  const edge = read('supabase/functions/agent-execute/index.ts');
  const growth = read('src/lib/modules/growth-module.ts');

  it('sync_ad_metrics is a growth skill with a nightly automation', () => {
    expect(growth).toMatch(/name: 'sync_ad_metrics'/);
    expect(growth).toMatch(/handler: 'internal:sync_ad_metrics'/);
    expect(growth).toMatch(/skill_name: 'sync_ad_metrics'/);
    expect(edge).toMatch(/handler === 'internal:sync_ad_metrics'/);
  });

  it('the handler goes through composio-proxy with toolkit metaads and never writes on dry_run', () => {
    const start = edge.indexOf('async function executeSyncAdMetrics(');
    const body = edge.slice(start, edge.indexOf('// ad_optimize —', start));
    expect(body).toMatch(/composioExecuteTool\(supabaseUrl, serviceKey, 'metaads'/);
    expect(body).toMatch(/METAADS_GET_INSIGHTS/);
    // every ledger write sits behind the dry-run gate
    for (const m of body.matchAll(/from\('ad_campaigns'\)\.(update|insert)\(/g)) {
      const before = body.slice(Math.max(0, m.index! - 400), m.index);
      expect(before, `write at ${m.index}`).toMatch(/if \(!dryRun\)/);
    }
    expect(body).not.toMatch(/\.delete\(/);
    expect(body).not.toMatch(/META_ADS_ACCESS_TOKEN|graph\.facebook\.com/);
  });
});
