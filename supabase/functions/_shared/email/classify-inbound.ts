/** Pure: no Deno, no fetch. Shared by every inbound mail path (ingest-message.ts). */
/**
 * Classify an inbound message so downstream automations know whether a human
 * is actually waiting for an answer.
 *   - `known`   — resolved to a lead/contact/company in the CRM.
 *   - `noise`   — bulk/marketing/system mail (List-Unsubscribe, Precedence: bulk,
 *                 no-reply senders, auto-submitted). Never becomes a ticket.
 *   - `unknown` — a human we don't know yet.
 */
export function classifyInbound(input: {
  headers: Record<string, string>;
  fromEmail: string;
  resolvedToCrm: boolean;
}): 'known' | 'noise' | 'unknown' {
  const { headers, fromEmail, resolvedToCrm } = input;
  const addr = (fromEmail.match(/<([^>]+)>/)?.[1] || fromEmail).trim().toLowerCase();

  const bulkHeader =
    !!headers['list-unsubscribe'] ||
    !!headers['list-id'] ||
    /bulk|list|junk/i.test(headers['precedence'] || '') ||
    (!!headers['auto-submitted'] && headers['auto-submitted'] !== 'no') ||
    !!headers['x-campaign-id'] ||
    !!headers['feedback-id'];

  const noReplySender =
    /^(no[-._]?reply|do[-._]?not[-._]?reply|noreply|donotreply|notifications?|mailer[-.]daemon|newsletter|news|marketing|postmaster|bounce)/.test(
      addr.split('@')[0] || '',
    );

  if (bulkHeader || noReplySender) return 'noise';
  return resolvedToCrm ? 'known' : 'unknown';
}
