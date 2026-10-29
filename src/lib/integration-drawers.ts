import type { IntegrationsSettings } from '@/hooks/useIntegrations';

// Integrations whose card opens a configuration drawer. Every config-based key
// MUST be here: its credential IS a field in the drawer, so without one the
// card can never become configured. SMTP was missing until 2026-10-29 — the
// card read "Setup needed" and clicking it did nothing (Nordbrygg).
export const DRAWER_KEYS: Array<keyof IntegrationsSettings> = ['openai', 'gemini', 'local_llm', 'n8n', 'resend', 'smtp', 'google_analytics', 'meta_pixel', 'slack', 'jina', 'hunter', 'searxng', 'firecrawl', 'telegram', 'twilio', 'elks46', 'gatewayapi', 'composio'];
