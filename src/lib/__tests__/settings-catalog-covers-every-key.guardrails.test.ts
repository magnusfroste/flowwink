/**
 * Every setting is described where an agent looks (2026-11-22).
 *
 * `site_settings` held 67 keys; an agent reached them through a free `key`
 * string whose instructions named four keys that do not exist. The catalogue
 * (supabase/functions/_shared/settings/catalog.ts) is now what
 * `manage_site_settings describe` hands out. This guard finds every key the
 * code uses (scripts/lib/scan-settings-keys.mjs) and holds the two together,
 * both ways — a new setting arrives with its description, or CI is red.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeSettings, judgeSettingWrite, redactSetting, secretFieldsIn, SETTINGS_CATALOG,
} from '../../../supabase/functions/_shared/settings/catalog';
import { scanSettingsKeys } from '../../../scripts/lib/scan-settings-keys.mjs';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const used: Record<string, string[]> = scanSettingsKeys(ROOT);

describe('the catalogue and the code', () => {
  it('every key the code reads or writes is described', () => {
    const missing = Object.keys(used).filter((k) => !SETTINGS_CATALOG[k]);
    expect(missing, `Describe these in _shared/settings/catalog.ts (used in ${missing.map((k) => `${k}: ${used[k][0]}`).join('; ')})`).toEqual([]);
  });

  it('every described key is used somewhere — the catalogue describes nothing that is gone', () => {
    const stale = Object.keys(SETTINGS_CATALOG).filter((k) => !used[k]);
    expect(stale).toEqual([]);
  });

  it('a setting names a module that exists', () => {
    const modules = new Set(
      [...read('src/lib/modules/index.ts').matchAll(/from '\.\/([a-z0-9-]+)-module'/g)].map((m) => m[1]),
    );
    const wrong = Object.entries(SETTINGS_CATALOG).filter(([, e]) => e.module && !modules.has(e.module)).map(([k, e]) => `${k} → ${e.module}`);
    expect(wrong).toEqual([]);
  });

  it('an admin page it names is a route', () => {
    const app = read('src/App.tsx');
    const wrong = Object.entries(SETTINGS_CATALOG)
      .filter(([, e]) => e.admin)
      .map(([k, e]) => [k, e.admin!.split(' ')[0]] as const)
      .filter(([, path]) => !app.includes(`path: "${path}"`))
      .map(([k, path]) => `${k} → ${path}`);
    expect(wrong).toEqual([]);
  });

  it('a skill it prefers is a skill', () => {
    const seeds = read('src/lib/platform-seeds.ts') + [...read('src/lib/modules/index.ts').matchAll(/from '\.\/([a-z0-9-]+-module)'/g)]
      .map((m) => read(`src/lib/modules/${m[1]}.ts`)).join('\n');
    const wrong = Object.entries(SETTINGS_CATALOG).filter(([, e]) => e.skill && !seeds.includes(`name: '${e.skill}'`)).map(([k, e]) => `${k} → ${e.skill}`);
    expect(wrong).toEqual([]);
  });
});

describe('what an agent is told', () => {
  it('describe lists the settings an agent may see, with fields, and never a credential', () => {
    const all = describeSettings() as { settings: Array<{ key: string; fields?: Record<string, string> }>; how_to_write: string };
    const keys = all.settings.map((s) => s.key);
    for (const k of ['general', 'seo', 'chat', 'store', 'maintenance', 'cookie_banner', 'system_ai', 'customer_portal']) expect(keys).toContain(k);
    expect(keys).not.toContain('gmail_integration');
    expect(keys).not.toContain('skills_artifact_sha');
    expect(all.settings.find((s) => s.key === 'chat')?.fields?.routingMode).toMatch(/ai_first/);
    expect(all.how_to_write).toMatch(/MERGES top-level/);
  });

  it('the keys the old instructions invented are unknown, and the answer points at the real one', () => {
    for (const k of ['site_name', 'theme', 'ai_config', 'chat_config']) expect(SETTINGS_CATALOG[k]).toBeUndefined();
    const v = judgeSettingWrite('chat_config', { title: 'x' }, false);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.code).toBe('UNKNOWN_SETTING');
    expect(v.ok === false && v.did_you_mean).toContain('chat');
  });

  it('the bookkeeping and credentials are not written; security waits for a person', () => {
    expect(judgeSettingWrite('skills_artifact_sha', 'x', true)).toMatchObject({ ok: false, code: 'SETTING_NOT_WRITABLE' });
    expect(judgeSettingWrite('gmail_integration', {}, true)).toMatchObject({ ok: false, code: 'SETTING_NOT_WRITABLE' });
    expect(judgeSettingWrite('security', { mfaRequiredForStaff: false }, false)).toMatchObject({ ok: false, code: 'PERSON_REQUIRED' });
    expect(judgeSettingWrite('security', { mfaRequiredForStaff: true }, true)).toEqual({ ok: true });
    expect(judgeSettingWrite('maintenance', { enabled: true }, false)).toEqual({ ok: true });
  });

  it('a credential is never read out and never written through a setting', () => {
    const stored = { resend: { enabled: true, config: { from: 'a@b.se', webhook_secret: 's3cr3t', apiKey: 'k' } }, sms: { config: { token: '' } } };
    const shown = redactSetting('integrations', stored) as typeof stored;
    expect(shown.resend.config.webhook_secret).toBe('[hidden]');
    expect(shown.resend.config.apiKey).toBe('[hidden]');
    expect(shown.resend.config.from).toBe('a@b.se');
    expect(shown.sms.config.token).toBe('');
    expect(redactSetting('gmail_integration', { refresh_token: 'x' })).toBe('[hidden]');
    expect(secretFieldsIn('integrations', { resend: { config: { apiKey: 'new' } } })).toEqual(['resend.config.apiKey']);
    expect(judgeSettingWrite('integrations', { resend: { config: { apiKey: 'new' } } }, true)).toMatchObject({ ok: false, code: 'SECRET_FIELD' });
    // Sending back what get answered ("[hidden]") is not a new credential.
    expect(judgeSettingWrite('integrations', { resend: { enabled: true, config: { apiKey: '[hidden]' } } }, false)).toEqual({ ok: true });
  });
});

describe('the skill uses it', () => {
  const core = read('supabase/functions/_shared/execute/core.ts');
  it('describe, redaction and the verdict sit in the settings handler', () => {
    expect(core).toMatch(/if \(action === 'describe'\)/);
    expect(core).toMatch(/settings\[row\.key\] = redactSetting\(row\.key, row\.value\)/);
    expect(core).toMatch(/const verdict = judgeSettingWrite\(/);
  });
  it('the instructions name no key that does not exist, and describe is a declared action', () => {
    const seeds = read('src/lib/platform-seeds.ts');
    const at = seeds.indexOf("name: 'manage_site_settings'");
    const skill = seeds.slice(at, seeds.indexOf("name: 'update_skill_instructions'"));
    expect(skill).toMatch(/'describe',\s+'get',/);
    for (const k of ['site_name', 'ai_config', 'chat_config']) expect(skill).not.toContain(k);
    expect(skill).not.toMatch(/REPLACES the whole value/);
  });
  it('describe and get_all are reads (a read-only key may call them)', () => {
    expect(read('supabase/functions/_shared/skills/read-surface.ts')).toMatch(/READ_ACTIONS = new Set\(\[[^\]]*'get_all', 'describe'/);
  });
});
