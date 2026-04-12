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
 */
export function getModuleWebhookEvents(moduleId: keyof ModulesSettings): WebhookEventInfo[] {
  // Check unified registry first
  if (isUnifiedModule(moduleId)) {
    const mod = getUnifiedModule(moduleId);
    if (mod?.webhookEvents) {
      return mod.webhookEvents;
    }
  }
  return LEGACY_WEBHOOK_EVENTS[moduleId] ?? [];
}
