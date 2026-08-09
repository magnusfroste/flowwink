import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyIdentityPolicy,
  scanForSecrets,
  findBrokenNavTargets,
  IDENTITY_FIELDS,
} from '../../../supabase/functions/_shared/site-identity';

/**
 * A template is a design that travels. The settings around it are not design —
 * they say who this is.
 *
 * The case that forced this, from a real export of the Restagård site
 * (2026-08-09): the body carried chatSettings.welcomeMessage containing
 * "sign in (demo@flowwink.com / demo1234)". Installed on a customer, their chat
 * widget would have greeted visitors with somebody else's login. Alongside it:
 * organizationName "FlowWink Demo", the demo concierge system prompt, the
 * demo's SEO title on every page, and demo@flowwink.com as footer contact.
 */

/** The shape that actually came out of the export, trimmed to what matters. */
const LEAKY_EXPORT = {
  id: 'resta',
  name: 'resta',
  pages: [
    { title: 'Resta gård', slug: 'restagard', isHomePage: true, blocks: [] },
    { title: 'Griskött', slug: 'gris', blocks: [] },
  ],
  branding: {
    organizationName: 'FlowWink Demo',
    brandTagline: 'A live, autonomous business',
    logo: '',
    primaryColor: '217 91% 60%',
    borderRadius: 'md',
  },
  chatSettings: {
    title: 'AI Assistant',
    widgetPosition: 'bottom-right',
    systemPrompt: 'You are the concierge for a public FlowWink demo…',
    welcomeMessage: 'Hi! This is a public demo. Ask me what FlowPilot is doing — or sign in (demo@flowwink.com / demo1234) and poke around.',
    suggestedPrompts: ['What does FlowPilot do here?'],
    n8nWebhookUrl: '',
  },
  seoSettings: {
    siteTitle: 'FlowWink Demo',
    titleTemplate: '%s | FlowWink Demo',
    robotsIndex: true,
  },
  footerSettings: { email: 'demo@flowwink.com', variant: 'full', showBrand: true },
  headerSettings: { variant: 'sticky', customNavItems: [{ id: 'docs', url: '/docs', label: 'Docs' }] },
  siteSettings: { homepageSlug: 'restagard' },
};

describe('the identity fields do not travel', () => {
  const { template, identity } = applyIdentityPolicy(LEAKY_EXPORT as unknown as Record<string, unknown>, true);

  it('removes the field that carried a password', () => {
    expect((template.chatSettings as Record<string, unknown>).welcomeMessage).toBeUndefined();
    expect(identity.stripped.map((s) => s.path)).toContain('chatSettings.welcomeMessage');
  });

  it('removes the origin company from branding, SEO and the footer', () => {
    expect((template.branding as Record<string, unknown>).organizationName).toBeUndefined();
    expect((template.seoSettings as Record<string, unknown>).siteTitle).toBeUndefined();
    expect((template.seoSettings as Record<string, unknown>).titleTemplate).toBeUndefined();
    expect((template.footerSettings as Record<string, unknown>).email).toBeUndefined();
  });

  it('and the agent prompt that would make the new site claim to be the old one', () => {
    expect((template.chatSettings as Record<string, unknown>).systemPrompt).toBeUndefined();
  });

  it('keeps the DESIGN — that is the whole point of a template', () => {
    expect((template.branding as Record<string, unknown>).primaryColor).toBe('217 91% 60%');
    expect((template.branding as Record<string, unknown>).borderRadius).toBe('md');
    expect((template.chatSettings as Record<string, unknown>).widgetPosition).toBe('bottom-right');
    expect((template.seoSettings as Record<string, unknown>).robotsIndex).toBe(true);
    expect((template.footerSettings as Record<string, unknown>).variant).toBe('full');
    expect(template.pages).toHaveLength(2);
  });

  it('explains every removal — a removal a caller cannot understand is one they disable', () => {
    for (const s of identity.stripped) {
      expect(s.why.length, `${s.path} has no reason`).toBeGreaterThan(20);
    }
  });

  it('does not report fields that were already empty', () => {
    // logo: '' and n8nWebhookUrl: '' are present but blank — nothing was lost.
    expect(identity.stripped.map((s) => s.path)).not.toContain('branding.logo');
    expect(identity.stripped.map((s) => s.path)).not.toContain('chatSettings.n8nWebhookUrl');
  });

  it('never mutates the caller\'s object', () => {
    expect(LEAKY_EXPORT.chatSettings.welcomeMessage).toContain('demo1234');
  });
});

describe('keeping identity is a choice made out loud', () => {
  const { template, identity } = applyIdentityPolicy(LEAKY_EXPORT as unknown as Record<string, unknown>, false);

  it('keeps everything when asked', () => {
    expect((template.branding as Record<string, unknown>).organizationName).toBe('FlowWink Demo');
    expect(identity.stripped).toHaveLength(0);
    expect(identity.kept_identity).toBe(true);
  });

  it('and says exactly what that means', () => {
    expect(identity.note).toMatch(/introduce itself as the origin/i);
  });

  it('but the scan still runs — "I chose to keep it" must stay distinct from "I did not know"', () => {
    expect(identity.possible_secrets.length).toBeGreaterThan(0);
  });
});

describe('the scan is the half that survives new fields', () => {
  it('finds the credential the named list happened to cover', () => {
    const hits = scanForSecrets({ chatSettings: { welcomeMessage: 'sign in (demo@flowwink.com / demo1234)' } });
    expect(hits.some((h) => h.kind === 'email')).toBe(true);
    expect(hits[0].path).toBe('chatSettings.welcomeMessage');
  });

  it('finds one in a field nobody thought to name', () => {
    // The point: IDENTITY_FIELDS will always be incomplete.
    const hits = scanForSecrets({ someNewSetting: { note: 'password: hunter2000' } });
    expect(hits.map((h) => h.kind)).toContain('credential');
    expect(hits[0].path).toBe('someNewSetting.note');
  });

  it('finds API keys and bearer tokens', () => {
    expect(scanForSecrets({ a: 'sk-abcdefghijklmnopqrstuvwx' })[0].kind).toBe('token');
    expect(scanForSecrets({ a: 'fwk_a78a1234567890ab' })[0].kind).toBe('token');
    expect(scanForSecrets({ a: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6' }).length).toBeGreaterThan(0);
  });

  it('finds credentials embedded in a URL', () => {
    expect(scanForSecrets({ url: 'https://admin:s3cret@hooks.example.com/x' })[0].kind).toBe('endpoint');
  });

  it('REDACTS what it finds — a report that prints the secret has only moved it', () => {
    const hit = scanForSecrets({ a: 'sk-abcdefghijklmnopqrstuvwx' })[0];
    expect(hit.redacted).not.toContain('abcdefghijklmnop');
    expect(hit.redacted).toMatch(/chars\)$/);
  });

  it('reports rather than deletes — a false positive must not eat real content', () => {
    const body = { pages: [{ blocks: [{ data: { text: 'Skriv till info@restagard.se' } }] }] };
    const { template, identity } = applyIdentityPolicy(body as unknown as Record<string, unknown>, true);
    expect(JSON.stringify(template)).toContain('info@restagard.se');
    expect(identity.possible_secrets.length).toBe(1);
  });

  it('does not repeat one path twenty times because a page repeats an address', () => {
    const body = { a: 'x@y.se', b: 'x@y.se q@z.se' };
    expect(scanForSecrets(body).filter((h) => h.path === 'b')).toHaveLength(1);
  });

  it('finds nothing in a clean body', () => {
    expect(scanForSecrets({ pages: [{ title: 'Griskött', blocks: [] }] })).toHaveLength(0);
  });
});

describe('navigation that points nowhere', () => {
  it('flags a nav item whose target the template does not carry', () => {
    // The live export linked to /docs — a page that exists on the demo and
    // nowhere else.
    expect(findBrokenNavTargets(LEAKY_EXPORT as never)).toEqual([{ label: 'Docs', url: '/docs' }]);
  });

  it('accepts a target the template does carry', () => {
    const t = { ...LEAKY_EXPORT, headerSettings: { customNavItems: [{ url: '/gris', label: 'Gris' }] } };
    expect(findBrokenNavTargets(t as never)).toEqual([]);
  });

  it('leaves external links alone — those are the author\'s business', () => {
    const t = { ...LEAKY_EXPORT, headerSettings: { customNavItems: [{ url: 'https://x.se', label: 'X' }] } };
    expect(findBrokenNavTargets(t as never)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Wiring — one rule, reaching BOTH exports
// ---------------------------------------------------------------------------

const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf-8');
const frontendExporter = readFileSync(
  resolve(__dirname, '../../../src/lib/template-exporter.ts'), 'utf-8');
const templatesModule = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/templates-module.ts'), 'utf-8');
const exportTab = readFileSync(
  resolve(__dirname, '../../../src/components/admin/templates/TemplateExportTab.tsx'), 'utf-8');

describe('the rule has ONE home and reaches both exports', () => {
  it('the agent path applies it', () => {
    expect(agentExecute).toMatch(/import \{ applyIdentityPolicy \} from '\.\.\/_shared\/site-identity\.ts'/);
    expect(agentExecute).toMatch(/const policy = applyIdentityPolicy\(template, stripIdentity\)/);
  });

  it('the ADMIN UI path applies the same module — it is where the leak was found', () => {
    // The pasted JSON came from the export tab, not from an agent. Fixing only
    // the handler would have left the human path leaking.
    expect(frontendExporter).toMatch(/from '\.\.\/\.\.\/supabase\/functions\/_shared\/site-identity'/);
    expect(frontendExporter).toMatch(/applyIdentityPolicy\(template as unknown as Record<string, unknown>, stripIdentity\)/);
  });

  it('and neither carries its own copy of the field list', () => {
    expect(agentExecute).not.toMatch(/organizationName.*brandTagline/s);
    expect(frontendExporter).not.toMatch(/IDENTITY_FIELDS\s*=/);
  });

  it('the saved and validated body is the STRIPPED one, not the raw one', () => {
    // The bug that would make this whole thing theatre: report the removal,
    // store the original.
    expect(agentExecute).toMatch(/p_template: body \}\)/);
    expect(agentExecute).toMatch(/p_template_json: body,/);
    expect(agentExecute).toMatch(/template: body,\n\s{4}validation,\n\s{4}identity: policy\.identity,/);
  });
});

describe('stripping is the default, and keeping is explicit', () => {
  it('defaults ON in the agent path', () => {
    expect(agentExecute).toMatch(/const stripIdentity = a\.strip_identity !== false/);
  });

  it('defaults ON in the UI path', () => {
    expect(frontendExporter).toMatch(/stripIdentity = true,/);
  });

  it('the DESCRIPTION says so — the tier an agent reads before calling', () => {
    const desc = templatesModule.slice(
      templatesModule.indexOf('const EXPORT_SITE_TEMPLATE_DESCRIPTION'),
      templatesModule.indexOf('const TEMPLATE_SKILLS'));
    expect(desc).toMatch(/By default it STRIPS the fields that identify the origin instance/);
    expect(desc).toMatch(/strip_identity=false to keep them/);
  });

  it('the instructions carry the incident, not just the rule', () => {
    expect(templatesModule).toMatch(/demo@flowwink\.com \/ demo1234/);
    expect(templatesModule).toMatch(/somebody else's login/);
  });

  it('and the parameter is declared, so the self-correcting hint stays accurate', () => {
    expect(templatesModule).toMatch(/strip_identity: \{\n\s+type: 'boolean'/);
  });
});

describe('a human running the export sees it too', () => {
  it('the export tab renders the removals, the scan hits and the broken nav', () => {
    expect(exportTab).toMatch(/exportResult\.identity/);
    expect(exportTab).toMatch(/Instance identity/);
    expect(exportTab).toMatch(/it looks sensitive/);
    expect(exportTab).toMatch(/broken_nav_targets/);
  });

  it('the report does not end up inside the downloaded template body', () => {
    expect(frontendExporter).toMatch(/enumerable: false/);
  });
});

describe('the field list stays reviewable', () => {
  it('every entry has a path and a reason', () => {
    for (const f of IDENTITY_FIELDS) {
      expect(f.path).toMatch(/^[a-zA-Z]+\.[a-zA-Z0-9]+$/);
      expect(f.why.length).toBeGreaterThan(20);
    }
  });

  it('covers the four groups the incident spanned', () => {
    const paths = IDENTITY_FIELDS.map((f) => f.path);
    expect(paths).toContain('branding.organizationName');
    expect(paths).toContain('chatSettings.welcomeMessage');
    expect(paths).toContain('seoSettings.siteTitle');
    expect(paths).toContain('footerSettings.email');
  });
});
