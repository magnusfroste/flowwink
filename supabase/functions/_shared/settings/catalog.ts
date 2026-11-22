// The settings catalogue — what the platform can be set to, told to an agent
// (2026-11-22).
//
// `site_settings` is a key → JSON store with 67 keys in use. An agent reached
// them through `manage_site_settings`, a free `key` string and nothing else:
// its instructions named four keys that do not exist (site_name, theme,
// ai_config, chat_config), and no field of chat, seo, store, the cookie
// banner, maintenance mode or the AI provider was described anywhere an agent
// reads. Over time the owner wants an agent to set a platform up instead of
// clicking through it — so every setting a person can change is described
// here, once, and `manage_site_settings action: describe` hands it out.
//
// Who may write:
//   write    — an agent reads and writes it (prefer `skill` where one is named)
//   person   — an agent reads it; a write needs a person at the keyboard
//              (FlowChat or the admin). Security dials.
//   internal — the platform's own bookkeeping; read only
//   secret   — never returned, never written by an agent
// `secret_fields` are hidden in every answer and refused in a write.
//
// A key the code uses and this list does not describe fails CI
// (`settings-catalog-covers-every-key`, scanner scripts/lib/scan-settings-keys.mjs).

export type SettingAccess = 'write' | 'person' | 'internal' | 'secret';

export interface SettingEntry {
  /** What it decides, in one or two sentences. */
  purpose: string;
  /** The module it belongs to; null = the platform. */
  module: string | null;
  access: SettingAccess;
  /** Where a person changes it. */
  admin?: string;
  /** A dedicated skill that writes it better than the generic update. */
  skill?: string;
  /** field → meaning (and allowed values). The fields an agent is likely to set. */
  fields?: Record<string, string>;
  /** Fields that hold credentials: hidden on read, refused on write. */
  secret_fields?: string[];
}

export const SETTINGS_CATALOG: Record<string, SettingEntry> = {
  // ── The site ────────────────────────────────────────────────────────────
  general: {
    purpose: 'The site itself: which page is the home page, its public address, where the terms live, the business country.',
    module: null, access: 'write', admin: '/admin/settings', skill: 'set_business_home',
    fields: {
      homepageSlug: 'Slug of the page served at /.',
      siteUrl: 'Public address, e.g. https://www.example.com — used for absolute links in mail, PDFs and signing pages.',
      termsSlug: 'Slug of the page with the terms block (default "terms").',
      country: 'ISO 3166-1 alpha-2, e.g. SE. Set with set_business_home together with currency and time zone.',
      contentReviewEnabled: 'true = content waits for review before it is published.',
    },
  },
  seo: {
    purpose: 'Search engines: the site title, the default description and image, and whether the site may be indexed.',
    module: null, access: 'write', admin: '/admin/settings (SEO)',
    fields: {
      siteTitle: 'The site name in titles and previews.',
      titleTemplate: 'e.g. "%s | Example" — %s is the page title.',
      defaultDescription: 'Meta description for pages without their own.',
      ogImage: 'Default share image URL.',
      twitterHandle: '@handle', googleSiteVerification: 'Search Console token (public).',
      robotsIndex: 'false = ask search engines not to index.', robotsFollow: 'false = nofollow.',
      developmentMode: 'true = the site answers noindex and may require sign-in.', requireAuthInDevMode: 'Sign-in wall while in development mode.',
    },
  },
  aeo: {
    purpose: 'Answer-engine optimisation: llms.txt, schema.org, sitemap — how AI assistants and crawlers read the site.',
    module: null, access: 'write', admin: '/admin/settings (AEO)',
    fields: {
      enabled: 'Master switch.', organizationName: 'Name in structured data.', shortDescription: 'One-line description.',
      contactEmail: 'Public contact.', llmsTxtEnabled: 'Serve /llms.txt.', llmsFullTxtEnabled: 'Serve /llms-full.txt.',
      schemaOrgType: 'Organization | LocalBusiness | …', socialProfiles: 'Profile URLs.', sitemapEnabled: 'Serve sitemap.xml.',
    },
  },
  performance: {
    purpose: 'How the site is delivered: lazy images, prefetching and edge caching of the page shell. Not the cron cadence (that is set_performance_mode).',
    module: null, access: 'write', admin: '/admin/settings (Performance)',
    fields: { enableEdgeCaching: 'Cache the HTML shell at the edge.', edgeCacheTtlMinutes: 'How long.', lazyLoadImages: 'Lazy-load images.', prefetchLinks: 'Prefetch on hover.' },
  },
  branding: {
    purpose: 'How the site looks: logo, colours per theme, fonts, heading style, corners, the theme toggle.',
    module: null, access: 'write', admin: '/admin/branding', skill: 'site_branding_update',
    fields: {
      organizationName: 'Name shown next to the logo.', logo: 'Logo URL (light theme).', logoDark: 'Logo for dark theme.', logoEmail: 'PNG/JPG logo for mail (SVG is blocked by mail clients).',
      primaryColor: 'HSL "H S% L%" (site_branding_update takes hex).', primaryColorDark: 'Dark-theme primary.', accentColor: 'Accent.',
      headingFont: 'Font name.', bodyFont: 'Font name.', defaultTheme: 'light | dark | system', allowThemeToggle: 'Show the theme switch.',
      borderRadius: 'none | sm | md | lg', sectionAlternation: 'auto | none', brandTagline: 'Line under the logo in the footer.',
      shadowIntensity: 'none | subtle | medium', heroOverlayOpacity: 'none | light | medium | strong', scrollAnimations: 'on | eager | off',
    },
  },
  custom_themes: { purpose: 'Saved theme presets a person can switch between.', module: null, access: 'write', admin: '/admin/branding' },
  custom_scripts: {
    purpose: 'Code injected on every public page — a tag manager or an analytics snippet. Max 16 000 characters per slot; never for styling.',
    module: null, access: 'person', admin: '/admin/settings (Scripts)',
    fields: { headStart: 'Top of <head>.', headEnd: 'End of <head>.', bodyStart: 'Start of <body>.', bodyEnd: 'End of <body>.' },
  },
  cookie_banner: {
    purpose: 'The cookie banner a visitor sees: on/off and its texts.',
    module: null, access: 'write', admin: '/admin/settings (Cookies)',
    fields: { enabled: 'Show the banner.', title: 'Heading.', description: 'Body text.', policyLinkText: 'Link text.', policyLinkUrl: 'Policy page.', acceptButtonText: 'Accept.', rejectButtonText: 'Reject.' },
  },
  cookie_consent_v2: { purpose: 'Consent categories and how a visitor\'s choice is kept (the second-generation consent model).', module: null, access: 'write', admin: '/admin/settings (Cookies)' },
  maintenance: {
    purpose: 'Maintenance mode: visitors see a message instead of the site; staff still sign in.',
    module: null, access: 'write', admin: '/admin/settings (Maintenance)',
    fields: { enabled: 'On/off.', title: 'Heading visitors see.', message: 'Body text.', expectedEndTime: 'ISO time it is expected to end.' },
  },
  footer: { purpose: 'Legacy footer configuration; the footer is a global block today (manage_global_blocks).', module: 'pages', access: 'write', skill: 'manage_global_blocks' },
  site_languages: {
    purpose: 'Which languages the site speaks. `default` is the language at the plain addresses; `enabled` the others.',
    module: null, access: 'write', admin: '/admin/settings (Languages)', skill: 'translate_site',
    fields: { default: 'Site language, e.g. "sv". Changing it moves every address — a launch decision, ask first.', enabled: 'Array of language tags; add one with translate_site (declares and translates).' },
  },
  platform_locale: {
    purpose: 'How numbers, money and times are shown: currency, time zone, decimals.',
    module: null, access: 'write', admin: '/admin/settings', skill: 'set_business_home',
    fields: { default_currency: 'ISO 4217, e.g. SEK.', default_timezone: 'IANA, e.g. Europe/Stockholm.', amount_decimals: "'auto' | 0 | 2" },
  },
  ui_text: {
    purpose: 'The visitor texts around the blocks (buttons, empty states) per language — overlays "@<lang>".',
    module: null, access: 'write', admin: '/admin/settings (Visitor texts)', skill: 'translate_ui_text',
  },
  translation_sweep: { purpose: 'Where translate_site stands per language (running | done | stuck).', module: null, access: 'internal' },
  security: {
    purpose: 'Security dials for staff accounts.', module: null, access: 'person', admin: '/admin/users',
    fields: { mfaRequiredForStaff: 'true = every staff member must use a second factor.' },
  },
  data_retention: {
    purpose: 'How long the platform keeps logs of agent and skill calls before thinning them.',
    module: null, access: 'person', admin: '/admin/system (Observability → Database size)',
    fields: { answers_days: 'Days a lookup keeps its full answer (default 30).', rows_days: 'Days before a read/failed row goes (default 90).' },
  },
  customer_portal: {
    purpose: 'The customer portal at /account: whether customers may sign up and check out as guests.',
    module: null, access: 'write', admin: '/admin/settings (Customer portal)',
    fields: { enabled: 'Portal on.', allowSelfSignup: 'Customers create their own account.', requireEmailVerification: 'Confirm e-mail first.', guestCheckout: 'Buy without an account.' },
  },
  // ── Identity the agents read ────────────────────────────────────────────
  company_profile: { purpose: 'Business identity: services, proof points, testimonials, the call to action, content angles — what page and post writers read.', module: null, access: 'write', admin: '/admin/company-insights', skill: 'update_company_profile' },
  company_name: { purpose: 'Legacy single-string company name; the trading name lives in company_profile and branding.organizationName.', module: null, access: 'write', skill: 'update_company_profile' },
  brand_tone: { purpose: 'The voice the site writes in (legacy; company_profile carries it today).', module: null, access: 'write', skill: 'update_company_profile' },
  business_identity: { purpose: 'Legacy identity record kept for voice channels and resets.', module: null, access: 'write', skill: 'update_company_profile' },
  business_profile: { purpose: 'Legacy business profile, cleared by a site reset.', module: null, access: 'write', skill: 'update_company_profile' },
  industry: { purpose: 'The business\'s industry, read by sales context.', module: null, access: 'write', skill: 'update_company_profile' },
  operator: { purpose: 'Which agent operates the site when FlowPilot is off (optional explicit declaration).', module: null, access: 'write', admin: '/admin/agents' },
  instance_identity: { purpose: 'This instance\'s id, used when it reports to the fleet.', module: null, access: 'internal' },
  // ── AI ──────────────────────────────────────────────────────────────────
  system_ai: {
    purpose: 'Which AI provider and models the platform uses for everything internal (FlowPilot, writing, translation).',
    module: null, access: 'write', admin: '/admin/settings (AI)',
    fields: {
      provider: 'openai | gemini | anthropic | local | … — keys are set as secrets, never here.',
      openaiModel: 'Model id.', geminiModel: 'Model id.', anthropicModel: 'Model id.', defaultTone: 'professional | friendly | formal', defaultLanguage: 'Language for generated text.',
    },
  },
  chat: {
    purpose: 'The visitor chat: texts, routing between AI and people, tools, the widget, privacy and voice.',
    module: 'chat', access: 'write', admin: '/admin/chat',
    fields: {
      title: 'Header.', welcomeMessage: 'First message.', placeholder: 'Input hint.', systemPrompt: 'Extra instructions to the chat AI.',
      providerOverride: "'system' follows system_ai; a provider pins the public chat only.",
      routingMode: 'ai_first | human_first | ai_only | human_only', humanHandoffEnabled: 'Visitor may ask for a person.',
      toolCallingEnabled: 'The chat may run skills.', allowedSkillNames: 'Allow-list of skills (empty = all public ones).', webSearchEnabled: 'May search the web.',
      widgetEnabled: 'Floating widget.', widgetPosition: 'bottom-right | bottom-left', widgetButtonText: 'Launcher text.', leadCaptureEnabled: 'Ask for an e-mail after the first message.',
      suggestedPrompts: 'Starter questions.', saveConversations: 'Keep transcripts.', dataRetentionDays: 'How long.', includeKbArticles: 'Answer from the knowledge base.',
    },
  },
  cowork_chat: { purpose: 'The staff workspace chat (FlowWork): which skills it may use and how it behaves.', module: 'workspace-chat', access: 'write', admin: '/admin/settings (Workspace chat)' },
  autonomy_schedule: {
    purpose: 'When FlowPilot works on its own: heartbeat hours, the morning briefing, the nightly learning.',
    module: 'flowpilot', access: 'write', admin: '/admin/flowpilot (Behaviour)',
    fields: { timezone: 'IANA.', heartbeatEnabled: 'Runs at heartbeatHours.', heartbeatHours: 'e.g. [0, 12].', briefingEnabled: 'Morning briefing.', briefingHour: 'Local hour.', learnEnabled: 'Nightly learning.', learnHour: 'Local hour.' },
  },
  heartbeat_overrides: { purpose: 'Per-instance adjustments to FlowPilot\'s heartbeat (limits, skipped steps).', module: 'flowpilot', access: 'person' },
  web_layer: { purpose: 'Which provider reads and searches the web (built-in, Firecrawl, Jina) and in what order.', module: null, access: 'write', admin: '/admin/integrations (Web)' },
  web_provider_status: { purpose: 'Last known health of each web provider.', module: null, access: 'internal' },
  // ── Integrations ────────────────────────────────────────────────────────
  integrations: {
    purpose: 'Which third-party services are on and how they are configured: mail (Resend/SMTP), payments (Stripe), SMS, voice, n8n and more. API keys are secrets set outside this value.',
    module: null, access: 'write', admin: '/admin/integrations',
    fields: { '<provider>.enabled': 'Provider on/off.', '<provider>.config': 'Its non-secret settings (sender, from number, host …).' },
    secret_fields: ['webhook_secret', 'apiKey', 'api_key', 'password', 'pass', 'token', 'secret', 'client_secret', 'access_token', 'refresh_token'],
  },
  integration_health: { purpose: 'Last check of each integration.', module: null, access: 'internal' },
  gmail_integration: { purpose: 'The connected Gmail account and its OAuth tokens.', module: 'email', access: 'secret', admin: '/admin/integrations' },
  gmail_oauth_state: { purpose: 'A Gmail sign-in in progress.', module: 'email', access: 'secret' },
  signal_ingest_token: { purpose: 'Token that lets outside systems post signals.', module: null, access: 'secret' },
  email_allowlist: {
    purpose: 'Outbound mail guard: while on, mail goes only to these domains and addresses (a test or staging safeguard).',
    module: 'email', access: 'person', admin: '/admin/email (Outbound guard)',
    fields: { enabled: 'Guard on.', domains: 'Allowed domains.', addresses: 'Allowed addresses.', scope: 'all | customer_facing' },
  },
  voice: { purpose: 'Phone and voice channel: numbers, greeting, routing.', module: 'voice', access: 'write', admin: '/admin/voice' },
  // ── Commerce and money ──────────────────────────────────────────────────
  store: {
    purpose: 'The shop: currency, tax display, store name, whether prices are shown at all.',
    module: 'products', access: 'write', admin: '/admin/products (Store settings)',
    fields: { currency: 'ISO 4217.', taxRate: 'Default rate in percent.', taxDisplay: 'inclusive | exclusive | hidden', taxLabel: 'e.g. "moms".', storeName: 'Name.', storefront: 'false = catalogue only, no prices or cart.' },
  },
  quotes: { purpose: 'What accepting a quote means.', module: 'quotes', access: 'write', admin: '/admin/quotes', fields: { accept_behavior: 'invoice = accepting creates a draft invoice; contract = an agreement follows.' } },
  sales_pipeline: { purpose: 'How deal values are shown.', module: 'deals', access: 'write', admin: '/admin/deals', fields: { deal_value_basis: 'per_period | arr | tcv' } },
  einvoice: {
    purpose: 'The seller\'s payment details printed on invoices and in e-invoices.',
    module: 'invoicing', access: 'write', admin: '/admin/invoices (E-invoice)',
    fields: { bankgiro: 'e.g. 123-4567.', iban: 'IBAN.', bic: 'BIC.' },
  },
  dunning: {
    purpose: 'Reminders for failed subscription payments.',
    module: 'subscriptions', access: 'write', admin: '/admin/subscriptions/dunning',
    fields: { enabled: 'On/off.', highValueThresholdCents: 'Above this a person is told.', supportEmail: 'Reply address.', updatePaymentUrl: 'Where the customer updates the card.' },
  },
  subscriptions: { purpose: 'Which subscription provider runs billing (local or Stripe).', module: 'subscriptions', access: 'write', admin: '/admin/subscriptions' },
  accounting_preferences: {
    purpose: 'How the books are kept and shown: currency format, fiscal year, VAT period, legal form, whether the ledger is kept elsewhere.',
    module: 'accounting', access: 'write', admin: '/admin/accounting (Settings)',
    fields: { fiscalYearStartMonth: '1–12.', vatReturnPeriod: 'monthly | quarterly | yearly', legalForm: 'limited_company | sole_trader | partnership | other', ledger: 'internal | external (books kept in another system)', currency: 'ISO 4217.' },
  },
  accounting_locale: { purpose: 'Which accounting pack is installed (e.g. se-bas2024).', module: 'accounting', access: 'internal' },
  // ── Content and support ─────────────────────────────────────────────────
  blog: {
    purpose: 'The blog: listing, RSS and the quality floor for new posts.',
    module: 'blog', access: 'write', admin: '/admin/blog (Settings)',
    fields: { postsPerPage: 'Number.', minWords: 'Word floor write_blog_post holds (default 600).', coverStyle: 'brand | photo …', rssEnabled: 'RSS feed.', archiveTitle: 'Archive heading.', showReadingTime: 'Show reading time.' },
  },
  kb: { purpose: 'The knowledge base\'s place in the menu.', module: 'kb', access: 'write', admin: '/admin/knowledge-base', fields: { menuSlug: 'Address.', menuTitle: 'Menu label.', showInMenu: 'Show it.' } },
  handbook_config: { purpose: 'The staff handbook\'s settings.', module: 'handbook', access: 'write', admin: '/admin/handbook' },
  tickets: { purpose: 'Support cases.', module: 'tickets', access: 'write', admin: '/admin/tickets', fields: { customerEmailEnabled: 'false = customers are not mailed a receipt or replies.' } },
  recruitment: { purpose: 'Recruitment: how applications are received and answered.', module: 'recruitment', access: 'write', admin: '/admin/recruitment' },
  visitor_intelligence_rules: { purpose: 'Rules for scoring and alerting on site visitors.', module: 'visitor-intelligence', access: 'write', admin: '/admin/visitor-intelligence' },
  feedback: {
    purpose: 'Where this instance sends feedback and whether it shares daily usage with the platform.',
    module: 'feedback', access: 'write', admin: '/admin/feedback',
    fields: { endpoint: 'The board instance, default https://www.flowwink.com.', share_usage: 'Send the daily ping.', board_title: 'Board heading.', board_intro: 'Board intro.' },
  },
  feedback_sent: { purpose: 'What has already been reported upstream (cadence).', module: 'feedback', access: 'internal' },
  // ── The platform's own bookkeeping ──────────────────────────────────────
  modules: { purpose: 'Which modules are on. Switch with manage_modules — it also switches their skills and automations.', module: null, access: 'write', admin: '/admin/modules', skill: 'manage_modules' },
  module_teardowns: { purpose: 'Modules a person or agent switched off, and why.', module: null, access: 'internal' },
  module_keeps: { purpose: 'Modules marked to stay on whatever their usage.', module: null, access: 'internal' },
  seeded_automations: { purpose: 'Automations already seeded once (so a deleted one stays deleted).', module: null, access: 'internal' },
  skills_artifact_sha: { purpose: 'Which skills bundle this instance last synced.', module: null, access: 'internal' },
  edge_functions_deployed: { purpose: 'Edge functions last seen deployed.', module: null, access: 'internal' },
  instance_manifest_stamp: { purpose: 'The instance manifest last applied.', module: null, access: 'internal' },
  demo_mode: { purpose: 'Public demo: shows the demo sign-in and allows the nightly reset.', module: null, access: 'person' },
  sandbox_mode: { purpose: 'Sandbox instance: allows the nightly reset.', module: null, access: 'person' },
  sandbox_template: { purpose: 'The template a sandbox is rebuilt from.', module: null, access: 'person' },
  testbed_mode: { purpose: 'Testbed: never reset, whatever demo_mode says.', module: null, access: 'person' },
};

const SECRET_NAME = /secret|api_?key|token|password|^pass$/i;

/** A copy of a setting's value with credential fields replaced by "[hidden]". */
export function redactSetting(key: string, value: unknown): unknown {
  const entry = SETTINGS_CATALOG[key];
  if (entry?.access === 'secret') return '[hidden]';
  const named = new Set((entry?.secret_fields ?? []).map((f) => f.toLowerCase()));
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
      const hide = (named.has(k.toLowerCase()) || SECRET_NAME.test(k)) && typeof inner === 'string' && inner !== '';
      out[k] = hide ? '[hidden]' : walk(inner);
    }
    return out;
  };
  return walk(value);
}

/** Credential fields a write carries (with a value), by path. */
export function secretFieldsIn(key: string, value: unknown, path = ''): string[] {
  const entry = SETTINGS_CATALOG[key];
  const named = new Set((entry?.secret_fields ?? []).map((f) => f.toLowerCase()));
  if (!value || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const [k, inner] of Object.entries(value as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if ((named.has(k.toLowerCase()) || SECRET_NAME.test(k)) && typeof inner === 'string' && inner !== '' && inner !== '[hidden]') found.push(p);
    else if (inner && typeof inner === 'object' && !Array.isArray(inner)) found.push(...secretFieldsIn(key, inner, p));
  }
  return found;
}

export type WriteVerdict =
  | { ok: true }
  | { ok: false; code: 'UNKNOWN_SETTING' | 'SETTING_NOT_WRITABLE' | 'PERSON_REQUIRED' | 'SECRET_FIELD'; hint: string; did_you_mean?: string[] };

/** May this caller write this key with this value? Pure. */
export function judgeSettingWrite(key: string, value: unknown, attended: boolean): WriteVerdict {
  const entry = SETTINGS_CATALOG[key];
  if (!entry) {
    const near = nearestKeys(key);
    return {
      ok: false, code: 'UNKNOWN_SETTING',
      hint: `"${key}" is not a setting. manage_site_settings action: "describe" lists every setting with its fields.`,
      ...(near.length ? { did_you_mean: near } : {}),
    };
  }
  if (entry.access === 'internal' || entry.access === 'secret') {
    return { ok: false, code: 'SETTING_NOT_WRITABLE', hint: `${key} is the platform's own ${entry.access === 'secret' ? 'credential' : 'bookkeeping'}; it is not set by hand.` };
  }
  if (entry.access === 'person' && !attended) {
    return { ok: false, code: 'PERSON_REQUIRED', hint: `${key} is changed by a person (${entry.admin ?? 'the admin'}) or from FlowChat with a person at the keyboard. Tell the owner what you would change and why.` };
  }
  const secrets = secretFieldsIn(key, value);
  if (secrets.length) {
    return { ok: false, code: 'SECRET_FIELD', hint: `${secrets.join(', ')} hold credentials; they are set as secrets under Integrations, never through a setting.` };
  }
  return { ok: true };
}

function nearestKeys(sent: string): string[] {
  const s = sent.toLowerCase();
  const words = s.split(/[^a-z0-9]+/).filter(Boolean);
  return Object.keys(SETTINGS_CATALOG)
    .map((k) => ({ k, score: (k.includes(s) || s.includes(k) ? 2 : 0) + words.filter((w) => w.length > 2 && k.includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.k);
}

/** The catalogue as an agent is handed it; one key, or every key an agent may see. */
export function describeSettings(key?: string, moduleOn: (m: string) => boolean = () => true): Record<string, unknown> {
  const shape = (k: string, e: SettingEntry) => ({
    key: k, purpose: e.purpose, module: e.module ?? 'platform', access: e.access,
    ...(e.module && !moduleOn(e.module) ? { module_off: true } : {}),
    ...(e.admin ? { admin: e.admin } : {}), ...(e.skill ? { prefer_skill: e.skill } : {}),
    ...(e.fields ? { fields: e.fields } : {}),
  });
  if (key) {
    const e = SETTINGS_CATALOG[key];
    if (!e) return { found: false, ...judgeSettingWrite(key, null, true) };
    return { found: true, setting: shape(key, e) };
  }
  const visible = Object.entries(SETTINGS_CATALOG).filter(([, e]) => e.access !== 'secret' && e.access !== 'internal');
  return {
    settings: visible.map(([k, e]) => shape(k, e)),
    count: visible.length,
    how_to_write: 'update MERGES top-level fields into what is stored: send only what changes. A nested object you send replaces that nested object, so get it first. Where prefer_skill is named, use that skill. access: person = a person must make the change; secrets are never set here.',
  };
}
