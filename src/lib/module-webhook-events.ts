/**
 * Module → Webhook Events Mapping (Legacy)
 * 
 * Most modules have been migrated to defineModule() where webhook events
 * are declared inline. This file handles lookup from both sources.
 */

import type { ModulesSettings } from '@/hooks/useModules';
import type { WebhookEventType } from '@/lib/webhook-utils';
import { getUnifiedModule, isUnifiedModule } from '@/lib/module-def';

export interface WebhookEventInfo {
  event: WebhookEventType;
  description: string;
}

/**
 * Legacy webhook events — only for modules NOT migrated to defineModule().
 */
const LEGACY_WEBHOOK_EVENTS: Partial<Record<keyof ModulesSettings, WebhookEventInfo[]>> = {
  // All modules migrated — this map is kept as safety net
};

/**
 * Get webhook events for a specific module.
 * Checks unified registry first, then legacy map.
 *
 * Returns events the module **emits** (producer side). For listeners, use
 * `getModuleListenedEvents`.
 */
export function getModuleWebhookEvents(moduleId: keyof ModulesSettings): WebhookEventInfo[] {
  // Check unified registry first
  if (isUnifiedModule(moduleId)) {
    const mod = getUnifiedModule(moduleId);
    // Prefer the new `agent.emits` field; fall back to legacy `webhookEvents`.
    const emits = mod?.agent?.emits ?? mod?.webhookEvents;
    if (emits) return emits;
  }
  return LEGACY_WEBHOOK_EVENTS[moduleId] ?? [];
}

/**
 * Get events this module **listens to** (consumer side). Empty for modules
 * that haven't declared listeners yet — populate when wiring event-bus graph.
 */
export function getModuleListenedEvents(moduleId: keyof ModulesSettings): WebhookEventInfo[] {
  if (!isUnifiedModule(moduleId)) return [];
  const mod = getUnifiedModule(moduleId);
  return mod?.agent?.listens ?? [];
}

