import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIntegrationStatus } from './useIntegrationStatus';
import { useComposioConnectedToolkits } from './useComposioConnectedToolkits';

// Email configuration (shared across all email-sending functions)
export interface EmailConfig {
  fromEmail: string;
  fromName: string;
  /** Optional override for outbound provider. When unset, email-send falls back to auto-detection. */
  provider?: 'resend' | 'composio' | 'smtp';
}


// Newsletter tracking configuration
export interface NewsletterTrackingConfig {
  enableOpenTracking: boolean;
  enableClickTracking: boolean;
}

// Provider-specific configuration stored per integration
export interface IntegrationProviderConfig {
  // Common
  apiKey?: string;  // For integrations where user can set key in UI
  // OpenAI
  baseUrl?: string;
  /**
   * Local LLM only: the single model that endpoint serves (endpoint + model are
   * one credential). Hosted providers do NOT pick a model here — see `models`.
   */
  model?: string;
  /**
   * Curated model catalog for a hosted AI provider: the gross list of model
   * names this key is approved to use. Availability only — which model is USED
   * per tier is policy and lives in site_settings.system_ai (the model map).
   * See src/lib/ai-model-catalog.ts.
   */
  models?: string[];
  // Local LLM
  endpoint?: string;
  // N8N
  webhookUrl?: string;
  webhookType?: 'chat' | 'generic';
  triggerMode?: 'always' | 'keywords' | 'fallback';
  triggerKeywords?: string[];
  // Email (for resend integration)
  emailConfig?: EmailConfig;
  // Newsletter tracking (for resend integration)
  newsletterTracking?: NewsletterTrackingConfig;
  // SMTP — values that aren't secrets (host/port/user/secure live here for visibility; password is in SMTP_PASS)
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  // Email router (which provider system emails use)
  provider?: 'smtp' | 'resend';
  fromEmail?: string;
  fromName?: string;
  // Google Analytics
  measurementId?: string;
  // Meta Pixel
  pixelId?: string;
  // Slack / Teams notifications
  notifyOnNewLead?: boolean;
  notifyOnDealWon?: boolean;
  notifyOnFormSubmit?: boolean;
  // Jina
  preferFreeTier?: boolean;
  // Meta Ads
  adAccountId?: string;
  // Hunter.io
  maxContacts?: number; // How many decision-makers to keep per prospect (saves credits)
  // OpenAI usage guard — soft monthly USD budget. UI warns when month-to-date
  // estimated spend reaches `warnAtPct` of this value. Does not block requests.
  monthlyBudgetUsd?: number;
  warnAtPct?: number; // 0-100, default 80
  // SearXNG — self-hosted search base URL (e.g. https://searx.example.com)
  url?: string;
  // Web-data provider fallback order (firecrawl/searxng/jina). 1 = try first.
  priority?: number;
  // Twilio / 46elks — E.164 sender number for SMS replies (e.g. +46701234567)
  from_number?: string;
  // GatewayAPI
  sender_id?: string;
  keyword?: string;
  // 46elks voice
  voice_webhook_url?: string;
  // ElevenLabs
  sttModel?: string;     // e.g. scribe_v1
  ttsModel?: string;     // e.g. eleven_multilingual_v2 / eleven_turbo_v2_5
  ttsVoiceId?: string;   // ElevenLabs voice ID
}

// Integration configuration type
export interface IntegrationConfig {
  enabled?: boolean;
  name: string;
  description: string;
  icon: string;
  /**
   * Delivered THROUGH another integration. 'composio' means there is no vault
   * secret of its own: the integration is configured when a Composio connected
   * account for `toolkit` exists (Modules → Composio → Quick Connect).
   */
  via?: 'composio';
  /** Composio toolkit slug when `via: 'composio'` (e.g. 'metaads'). */
  toolkit?: string;
  category: 'payments' | 'communication' | 'ai' | 'media' | 'automation' | 'analytics' | 'notifications' | 'sales' | 'advertising';
  features: string[];
  /** Who actually calls this key — so an admin can judge what a disconnect
   * costs (#97 B2). Skills/functions/surfaces, human-readable. */
  consumedBy?: string[];
  secretName?: string;
  docsUrl: string;
  docsLabel?: string;
  settingsUrl?: string;
  // Provider-specific config (stored per integration)
  config?: IntegrationProviderConfig;
}

// All integrations settings
export interface IntegrationsSettings {
  stripe: IntegrationConfig;
  stripe_webhook: IntegrationConfig;
  resend: IntegrationConfig;
  smtp: IntegrationConfig;
  openai: IntegrationConfig;
  gemini: IntegrationConfig;
  anthropic: IntegrationConfig;
  unsplash: IntegrationConfig;
  firecrawl: IntegrationConfig;
  local_llm: IntegrationConfig;
  n8n: IntegrationConfig;
  google_analytics: IntegrationConfig;
  meta_pixel: IntegrationConfig;
  slack: IntegrationConfig;
  hunter: IntegrationConfig;
  jina: IntegrationConfig;
  meta_ads: IntegrationConfig;
  composio: IntegrationConfig;
  searxng: IntegrationConfig;
  telegram: IntegrationConfig;
  twilio: IntegrationConfig;
  gatewayapi: IntegrationConfig;
  elks46: IntegrationConfig;
  elevenlabs: IntegrationConfig;
}


// Default settings - auto-enabled when API key exists, admin can explicitly disable
export const defaultIntegrationsSettings: IntegrationsSettings = {
  stripe: {

    name: 'Stripe',
    description: 'Payment processing',
    icon: 'CreditCard',
    category: 'payments',
    features: ['E-commerce', 'Checkout', 'Subscriptions'],
    consumedBy: ['create-checkout', 'stripe-webhook', 'invoice payments', 'subscriptions'],
    secretName: 'STRIPE_SECRET_KEY',
    docsUrl: 'https://stripe.com/docs/keys',
    docsLabel: 'Get API key',
  },
  stripe_webhook: {

    name: 'Stripe Webhook',
    description: 'Payment event notifications',
    icon: 'CreditCard',
    category: 'payments',
    features: ['Order status updates', 'Payment confirmations'],
    secretName: 'STRIPE_WEBHOOK_SECRET',
    docsUrl: 'https://stripe.com/docs/webhooks',
    docsLabel: 'Configure webhook',
  },
  resend: {

    name: 'Resend',
    description: 'Hosted email API — drop-in alternative to SMTP.',
    icon: 'Mail',
    category: 'communication',
    features: ['Newsletter', 'Order confirmations', 'Booking confirmations', 'Dunning'],
    consumedBy: ['email-send rail (all outbound email)', 'newsletters', 'order & booking confirmations', 'dunning'],
    secretName: 'RESEND_API_KEY',
    docsUrl: 'https://resend.com/docs/introduction',
    docsLabel: 'Get API key',
    config: {
      emailConfig: {
        fromEmail: 'onboarding@resend.dev',
        fromName: 'Newsletter',
      },
      newsletterTracking: {
        enableOpenTracking: false,
        enableClickTracking: false,
      },
    },
  },
  smtp: {
    name: 'SMTP',
    description:
      'Self-host friendly email transport. Works with Postfix, Mailgun SMTP, SES SMTP, Gmail SMTP, and any standards-compliant server.',
    icon: 'Mail',
    category: 'communication',
    features: ['Dunning', 'Newsletter', 'Order/booking confirmations', 'No vendor lock-in'],
    secretName: 'SMTP_PASS',
    docsUrl: 'https://nodemailer.com/smtp/',
    docsLabel: 'SMTP setup guide',
    config: {
      host: '',
      port: 587,
      secure: false,
      user: '',
    },
  },
  // Email Router moved to modules (see useModules.tsx → 'email').
  // It is an internal infrastructure module that consumes SMTP/Resend integrations.
  openai: {

    name: 'OpenAI',
    description: 'GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration'],
    consumedBy: ['chat-completion', 'FlowPilot reasoning', 'campaign generation', 'fit analysis', 'embeddings'],
    secretName: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get API key',
    // No default model here: which model is USED is policy and lives in the
    // system_ai model map. `config.models` (the approved catalog) is seeded
    // lazily from src/lib/ai-model-catalog.ts on first edit.
    config: {
      baseUrl: 'https://api.openai.com/v1',
      monthlyBudgetUsd: 50,
      warnAtPct: 80,
    },
  },
  gemini: {

    name: 'Google Gemini',
    description: 'Gemini 2.0, 1.5 Pro',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration'],
    consumedBy: ['chat-completion', 'FlowPilot reasoning (provider choice)'],
    secretName: 'GEMINI_API_KEY',
    docsUrl: 'https://aistudio.google.com/apikey',
    docsLabel: 'Get API key',
  },
  anthropic: {

    name: 'Anthropic',
    description: 'Claude Sonnet 4, Claude Opus 4',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration', 'Superior tool use'],
    consumedBy: ['chat-completion', 'FlowPilot reasoning (provider choice)'],
    secretName: 'ANTHROPIC_API_KEY',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get API key',
  },
  local_llm: {

    name: 'Local LLM',
    description: 'Self-hosted AI (Ollama, vLLM)',
    icon: 'Server',
    category: 'ai',
    features: ['HIPAA-compliant', 'Private', 'No API costs'],
    secretName: 'LOCAL_LLM_API_KEY',
    docsUrl: 'https://ollama.ai/',
    docsLabel: 'Setup guide',
    config: {
      endpoint: '',
      model: '',
    },
  },
  n8n: {

    name: 'N8N',
    description: 'Workflow automation',
    icon: 'Webhook',
    category: 'automation',
    features: ['Agentic workflows', 'Custom logic', 'Tool calling'],
    secretName: 'N8N_API_KEY',
    docsUrl: 'https://n8n.io/docs',
    docsLabel: 'Setup guide',
    config: {
      webhookUrl: '',
      webhookType: 'chat',
      triggerMode: 'always',
      triggerKeywords: [],
    },
  },
  unsplash: {

    name: 'Unsplash',
    description: 'Stock photo integration',
    icon: 'Image',
    category: 'media',
    features: ['Image picker in editor'],
    consumedBy: ['media library stock search'],
    secretName: 'UNSPLASH_ACCESS_KEY',
    docsUrl: 'https://unsplash.com/developers',
    docsLabel: 'Get API key',
  },
  google_analytics: {

    name: 'Google Analytics',
    description: 'Website traffic & attribution',
    icon: 'BarChart3',
    category: 'analytics',
    features: ['Page views', 'Events', 'Conversions', 'Attribution'],
    secretName: '',
    docsUrl: 'https://support.google.com/analytics/answer/9539598',
    docsLabel: 'Find Measurement ID',
    config: {
      measurementId: '',
    },
  },
  meta_pixel: {

    name: 'Meta Pixel',
    description: 'Facebook/Instagram ad tracking',
    icon: 'Target',
    category: 'analytics',
    features: ['Ad conversions', 'Retargeting', 'Lookalike audiences'],
    secretName: '',
    docsUrl: 'https://www.facebook.com/business/help/952192354843755',
    docsLabel: 'Find Pixel ID',
    config: {
      pixelId: '',
    },
  },
  slack: {

    name: 'Slack',
    description: 'Team notifications',
    icon: 'MessageSquare',
    category: 'notifications',
    features: ['New lead alerts', 'Deal won alerts', 'Form submission alerts'],
    secretName: '',
    docsUrl: 'https://api.slack.com/messaging/webhooks',
    docsLabel: 'Create webhook',
    config: {
      webhookUrl: '',
      notifyOnNewLead: true,
      notifyOnDealWon: true,
      notifyOnFormSubmit: false,
    },
  },
  firecrawl: {

    name: 'Firecrawl',
    description: 'Web scraping and search',
    icon: 'Flame',
    category: 'sales',
    features: ['Web scraping', 'Search', 'Company enrichment'],
    consumedBy: ['web-scrape', 'prospect_research', 'enrich_company', 'migrate_url'],
    secretName: 'FIRECRAWL_API_KEY',
    docsUrl: 'https://firecrawl.dev/docs',
    docsLabel: 'Get API key',
  },
  hunter: {

    name: 'Hunter.io',
    description: 'Email finder & domain search',
    icon: 'Target',
    category: 'sales',
    features: ['Domain Search', 'Email Finder', 'Prospect Research'],
    consumedBy: ['contact-finder (prospect_research)', 'verify_email'],
    secretName: 'HUNTER_API_KEY',
    docsUrl: 'https://hunter.io/api',
    docsLabel: 'Get API key',
    config: {
      maxContacts: 2,
    },
  },
  jina: {

    name: 'Jina AI',
    description: 'Web search & reader API',
    icon: 'Search',
    category: 'sales',
    features: ['Jina Search', 'Jina Reader', 'Prospect Research', 'Content Extraction'],
    consumedBy: ['web-search', 'web-scrape (fallback)', 'prospect_research'],
    secretName: 'JINA_API_KEY',
    docsUrl: 'https://jina.ai/reader/',
    docsLabel: 'Get API key',
    config: {
      preferFreeTier: true,
    },
  },
  meta_ads: {
    name: 'Meta Ads',
    // Delivered through Composio's `metaads` toolkit — the same rail LinkedIn
    // publishing runs on. Until 2026-10-03 this declared a META_ADS_ACCESS_TOKEN
    // that no edge function read and check-secrets never probed, so the Paid
    // Growth card said "Missing: meta_ads" forever (#623). Meta needs no App
    // Review for a business managing its OWN ad account, which is every
    // FlowWink instance: register one Meta app, add its client id/secret as a
    // Composio auth config, then Quick Connect.
    description: 'Facebook & Instagram ad spend and performance, synced from your own ad account through Composio',
    icon: 'Megaphone',
    category: 'advertising',
    features: ['Campaign & spend sync (nightly)', 'Performance tracking', 'Rule-based budget recommendations'],
    secretName: '',
    via: 'composio',
    toolkit: 'metaads',
    docsUrl: 'https://composio.dev/toolkits/metaads',
    docsLabel: 'Composio Meta Ads toolkit',
    config: {
      adAccountId: '',
    },
  },
  composio: {
    name: 'Composio',
    description: 'Connect to 1000+ apps via managed OAuth',
    icon: 'Network',
    category: 'automation',
    features: ['Gmail', 'Slack', 'HubSpot', 'Sheets', 'Intent-based tool resolution'],
    consumedBy: ['gmail-inbox-scan', 'social publishing (LinkedIn)', 'composio-proxy'],
    secretName: 'COMPOSIO_API_KEY',
    docsUrl: 'https://docs.composio.dev',
    docsLabel: 'Get API key',
  },
  searxng: {
    name: 'SearXNG',
    description: 'Self-hosted, privacy-respecting metasearch',
    icon: 'Globe',
    category: 'sales',
    features: ['Web search', 'Self-hosted', 'Free', 'Fallback for Firecrawl/Jina'],
    consumedBy: ['web-search (first choice)', 'research skills'],
    docsUrl: 'https://docs.searxng.org/',
    docsLabel: 'SearXNG docs',
    config: {
      url: '',
    },
  },
  telegram: {
    name: 'Telegram',
    description: 'Inbound + outbound chat via your Telegram bot. Webhook URL is derived automatically from this instance — you only set the bot token.',
    icon: 'Send',
    category: 'communication',
    features: ['Two-way messaging', 'Agent takeover', 'Callbacks'],
    secretName: 'TELEGRAM_BOT_TOKEN',
    docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    docsLabel: 'Create bot in BotFather',
  },
  twilio: {
    name: 'Twilio',
    description: 'SMS (and voice) channel. Inbound webhook routes to FlowPilot via chat-completion; outbound replies sent through the Twilio gateway.',
    icon: 'MessageSquare',
    category: 'communication',
    features: ['Inbound SMS', 'Outbound SMS', 'Agent takeover', 'Voice-ready'],
    secretName: 'TWILIO_API_KEY',
    docsUrl: 'https://console.twilio.com/',
    docsLabel: 'Open Twilio Console',
    config: { from_number: '' },
  },
  gatewayapi: {
    name: 'GatewayAPI',
    description: 'Danish SMS provider. Shared numbers (keyword-based) or dedicated numbers. No subscription, pay-per-SMS.',
    icon: 'MessageSquare',
    category: 'communication',
    features: ['Inbound SMS', 'Outbound SMS', 'Shared numbers', 'EU-hosted'],
    secretName: 'GATEWAYAPI_API_KEY',
    docsUrl: 'https://gatewayapi.com/',
    docsLabel: 'Open GatewayAPI',
    config: { sender_id: 'Flowwink', keyword: '' },
  },
  elks46: {
    name: '46elks',
    description: 'Swedish SMS + Voice provider (Uppsala). Pay-as-you-go, dedicated Swedish numbers, no subscription. Voice supports WebSocket streaming for real-time AI agents.',
    icon: 'Phone',
    category: 'communication',
    features: ['Inbound/Outbound SMS', 'Voice calls', 'Swedish numbers', 'EU-hosted', 'Voice streaming (AI-ready)'],
    secretName: 'ELKS46_API_PASSWORD',
    docsUrl: 'https://46elks.se/',
    docsLabel: 'Open 46elks',
    config: { from_number: '', voice_webhook_url: '' },
  },
  elevenlabs: {
    name: 'ElevenLabs',
    description: 'Studio-quality voice AI — Speech-to-Text (Scribe), Text-to-Speech, conversational voice agents, music, and SFX.',
    icon: 'Headphones',
    category: 'ai',
    features: ['Speech-to-Text (Scribe)', 'Text-to-Speech (multilingual)', 'Conversational agents', 'Music & SFX', 'Voice cloning'],
    secretName: 'ELEVENLABS_API_KEY',
    docsUrl: 'https://elevenlabs.io/app/settings/api-keys',
    docsLabel: 'Get API key',
    config: {
      sttModel: 'scribe_v1',
      ttsModel: 'eleven_multilingual_v2',
      ttsVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
    },
  },

};

// Category definitions
export const INTEGRATION_CATEGORIES = {
  payments: { label: 'Payments', order: 1 },
  communication: { label: 'Communication', order: 2 },
  ai: { label: 'AI Providers', order: 3 },
  sales: { label: 'Sales Intelligence', order: 4 },
  automation: { label: 'Automation', order: 5 },
  media: { label: 'Media & Tools', order: 6 },
  analytics: { label: 'Analytics & Attribution', order: 7 },
  notifications: { label: 'Notifications', order: 8 },
  advertising: { label: 'Advertising', order: 9 },
} as const;

// Fetch integrations settings
export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'integrations')
        .maybeSingle();

      if (error) throw error;

      // Merge with defaults to ensure all integrations exist
      const stored = (data?.value as Partial<IntegrationsSettings>) || {};
      const merged: IntegrationsSettings = { ...defaultIntegrationsSettings };

      for (const key of Object.keys(defaultIntegrationsSettings) as (keyof IntegrationsSettings)[]) {
        if (stored[key]) {
          merged[key] = { ...defaultIntegrationsSettings[key], ...stored[key] };
        }
      }

      return merged;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// Update integrations settings
export function useUpdateIntegrations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<IntegrationsSettings>) => {
      // Get current settings
      const { data: existing } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'integrations')
        .maybeSingle();

      const currentSettings = (existing?.value as unknown as IntegrationsSettings) || {};
      const newSettings = { ...currentSettings };

      // Merge updates
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          newSettings[key as keyof IntegrationsSettings] = {
            ...(currentSettings[key as keyof IntegrationsSettings] || {}),
            ...value,
          } as IntegrationConfig;
        }
      }

      const upsertData = {
        key: 'integrations',
        value: JSON.parse(JSON.stringify(newSettings)),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('site_settings')
        .upsert(upsertData, { onConflict: 'key' });

      if (error) throw error;
      return newSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations-settings'] });
      toast.success('Integration settings updated');
    },
    onError: (error) => {
      logger.error('Failed to update integration settings:', error);
      toast.error('Failed to update settings');
    },
  });
}

// Toggle a single integration
export function useToggleIntegration() {
  const updateIntegrations = useUpdateIntegrations();

  return (key: keyof IntegrationsSettings, enabled: boolean) => {
    updateIntegrations.mutate({
      [key]: { enabled },
    });
  };
}

// Config-based integrations: no vault secret needed, presence of required
// config field determines credential. EXPORTED so all callers share one list.
export const CONFIG_BASED_KEYS: ReadonlyArray<keyof IntegrationsSettings> = [
  'local_llm', 'n8n', 'google_analytics', 'meta_pixel', 'slack', 'searxng',
  // smtp is credential-optional on purpose: the sender passes `SMTP_PASS ?? ""`,
  // so a relay that accepts unauthenticated mail (Mailpit, MailHog, an internal
  // Postfix) works with no secret at all. Keying status off the secret would
  // report those as unconfigured while they were happily sending. The host is
  // what the backend actually requires, so that is what we check.
  'smtp',
];

/**
 * Integrations the BACKEND gates on `enabled === true` (opt-in), not on
 * `enabled !== false` (opt-out). See email-send/index.ts:
 *   resend   → enabled !== false   (default transport, opt-out)
 *   smtp     → enabled === true    (opt-in)
 *   composio → enabled === true    (opt-in)
 *
 * This list exists because the two halves disagreed: the UI called an
 * integration "active" as soon as its secret was present, while the sender
 * skipped it because `enabled` was undefined rather than true. The result was a
 * green tick over a transport that never sent a single message. Keep this in
 * sync with the gates in email-send — a mismatch here is a lying status badge,
 * which is worse than no badge at all.
 */
export const OPT_IN_KEYS: ReadonlyArray<keyof IntegrationsSettings> = ['smtp', 'composio'];

/** The Composio toolkit an integration is delivered through, or null when it has its own credential. */
export function composioToolkitFor(key: keyof IntegrationsSettings): string | null {
  const def = defaultIntegrationsSettings[key];
  return def?.via === 'composio' && def.toolkit ? def.toolkit.toLowerCase() : null;
}

/**
 * Does configuring this integration involve a vault secret at all? False for
 * config-based integrations (a URL or an id in settings) and for Composio-backed
 * ones (a connected account). The admin UI used to carry this as three separate
 * hand-written lists, which is how meta_ads could demand a secret nothing read.
 */
export function integrationNeedsSecret(key: keyof IntegrationsSettings): boolean {
  return !CONFIG_BASED_KEYS.includes(key) && composioToolkitFor(key) === null;
}

export function configHasCredential(
  key: keyof IntegrationsSettings,
  config: IntegrationProviderConfig | undefined,
): boolean {
  switch (key) {
    case 'local_llm': return !!config?.endpoint;
    case 'n8n': return !!config?.webhookUrl;
    case 'google_analytics': return !!config?.measurementId;
    case 'meta_pixel': return !!config?.pixelId;
    case 'slack': return !!config?.webhookUrl;
    case 'searxng': return !!config?.url;
    case 'smtp': return !!config?.host;
    default: return false;
  }
}

/**
 * Single source of truth for "is this integration usable right now?".
 * Pure function — call from hooks, components, or count loops.
 *
 * Rules (in order):
 *   1. Config-based (local_llm/n8n/ga/pixel/slack) → presence of required field
 *   2. Secret-based → presence of secret in Supabase vault
 *   3. Explicit `enabled: false` always wins → status='disabled'
 */
export function resolveIntegrationStatus(
  key: keyof IntegrationsSettings,
  secretsPresent: Partial<Record<keyof IntegrationsSettings, boolean>> | undefined,
  settings: Partial<IntegrationsSettings> | undefined,
  /** Lower-cased Composio toolkit slugs with an ACTIVE connected account (useComposioConnectedToolkits). */
  connectedToolkits: ReadonlyArray<string> = [],
): { hasKey: boolean; isActive: boolean; status: 'not_configured' | 'disabled' | 'active' } {
  const viaToolkit = composioToolkitFor(key);
  const cfg = settings?.[key]?.config ?? defaultIntegrationsSettings[key]?.config;
  const hasKey = viaToolkit !== null
    ? connectedToolkits.some((t) => t.toLowerCase() === viaToolkit)
    : integrationNeedsSecret(key)
      ? (secretsPresent?.[key] ?? false)
      : configHasCredential(key, cfg);
  // Opt-in integrations need an explicit true; for the rest, undefined means on.
  const optIn = OPT_IN_KEYS.includes(key);
  const enabledFlag = settings?.[key]?.enabled;
  const turnedOn = optIn ? enabledFlag === true : enabledFlag !== false;
  const isActive = hasKey && turnedOn;
  return {
    hasKey,
    isActive,
    status: !hasKey ? 'not_configured' : !turnedOn ? 'disabled' : 'active',
  };
}

// Check if an integration is active (has key/config + not explicitly disabled)
export function useIsIntegrationActive(key: keyof IntegrationsSettings) {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: integrationSettings } = useIntegrations();
  const { toolkits } = useComposioConnectedToolkits();

  const { hasKey, isActive, status } = resolveIntegrationStatus(
    key,
    secretsStatus?.integrations,
    integrationSettings,
    toolkits,
  );

  return { hasKey, isEnabled: isActive, isActive, status } as const;
}

// Get count of active integrations (uses shared resolveIntegrationStatus)
export function useActiveIntegrationsCount() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: integrationSettings } = useIntegrations();
  const { toolkits } = useComposioConnectedToolkits();

  if (!secretsStatus || !integrationSettings) return { active: 0, total: 0 };

  const keys = Object.keys(defaultIntegrationsSettings) as (keyof IntegrationsSettings)[];
  let active = 0;
  for (const key of keys) {
    if (resolveIntegrationStatus(key, secretsStatus.integrations, integrationSettings, toolkits).isActive) {
      active++;
    }
  }
  return { active, total: keys.length };
}
