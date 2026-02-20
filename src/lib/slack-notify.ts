import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';

interface SlackNotification {
  type: 'new_lead' | 'deal_won' | 'form_submit';
  title: string;
  fields: Array<{ label: string; value: string }>;
  url?: string;
}

/**
 * Send a notification to Slack/Teams via webhook.
 * Reads config from integrations settings. Fire-and-forget — never blocks UI.
 */
export async function sendSlackNotification(notification: SlackNotification): Promise<void> {
  try {
    // Fetch integration settings
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'integrations')
      .maybeSingle();

    const settings = data?.value as Record<string, unknown> | null;
    const slack = settings?.slack as {
      enabled?: boolean;
      config?: {
        webhookUrl?: string;
        notifyOnNewLead?: boolean;
        notifyOnDealWon?: boolean;
        notifyOnFormSubmit?: boolean;
      };
    } | undefined;

    if (!slack?.enabled || !slack?.config?.webhookUrl) return;

    // Check if this notification type is enabled
    const config = slack.config;
    if (notification.type === 'new_lead' && !config.notifyOnNewLead) return;
    if (notification.type === 'deal_won' && !config.notifyOnDealWon) return;
    if (notification.type === 'form_submit' && !config.notifyOnFormSubmit) return;

    // Build Slack message
    const fieldsText = notification.fields
      .map(f => `*${f.label}:* ${f.value}`)
      .join('\n');

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${notification.title}*\n${fieldsText}`,
        },
      },
    ];

    if (notification.url) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${notification.url}|View in FlowWink>`,
        },
      });
    }

    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
  } catch (error) {
    // Fire-and-forget — log but never throw
    logger.warn('[SlackNotify] Failed to send notification:', error);
  }
}

/**
 * Notify Slack about a new lead
 */
export function notifyNewLead(options: {
  name: string;
  email: string;
  source: string;
  score: number;
  leadId: string;
}): void {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  sendSlackNotification({
    type: 'new_lead',
    title: '🆕 New Contact',
    fields: [
      { label: 'Name', value: options.name || 'Unknown' },
      { label: 'Email', value: options.email },
      { label: 'Source', value: options.source },
      { label: 'Score', value: `${options.score} points` },
    ],
    url: baseUrl ? `${baseUrl}/admin/contacts/${options.leadId}` : undefined,
  });
}

/**
 * Notify Slack about a won deal
 */
export function notifyDealWon(options: {
  dealName: string;
  contactName: string;
  valueCents: number;
  leadId: string;
}): void {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const valueFormatted = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
  }).format(options.valueCents / 100);

  sendSlackNotification({
    type: 'deal_won',
    title: '🎉 Deal Won!',
    fields: [
      { label: 'Deal', value: options.dealName },
      { label: 'Contact', value: options.contactName },
      { label: 'Value', value: valueFormatted },
    ],
    url: baseUrl ? `${baseUrl}/admin/contacts/${options.leadId}` : undefined,
  });
}
