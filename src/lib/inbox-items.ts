/**
 * The Inbox is ONE queue over five existing truths — email threads, chat
 * conversations, tickets, form submissions, voice calls. No sixth table: each
 * row here is a read of a row that already exists, and every action links
 * back to the surface that owns it.
 *
 * The queue's organising question is not "which channel" but "who has it":
 *   - `agent`     — FlowPilot is on it (answering the chat, handled the call,
 *                   routed the mail). Visible, never hidden — the human can
 *                   read every step, but nothing is waiting on them.
 *   - `human`     — a person is needed: the operator escalated, a visitor
 *                   asked for one, a form came in, a callback is due, mail
 *                   awaits an answer.
 *   - `customer`  — the ball is with the customer.
 *   - `done`      — closed / answered / handled.
 * FlowPilot goes first: `human` is only what it could not or was not allowed
 * to finish (trust dial), so the queue is the operator's hand-off list.
 */

export type InboxChannel = 'email' | 'chat' | 'ticket' | 'form' | 'voice';
export type InboxState = 'agent' | 'human' | 'customer' | 'done';

export interface InboxItem {
  key: string;
  channel: InboxChannel;
  state: InboxState;
  /** Why it is in that state, in words a human reads ("visitor asked for a person"). */
  reason: string;
  who: string;
  subject: string;
  preview?: string | null;
  at: string; // ISO — last activity
  href: string;
  priority?: string | null;
  /** Who holds it when a human does. */
  assignedTo?: string | null;
  /**
   * The CRM record the item is bound to — the seller's lens. A seller's
   * outbound mail and the reply that comes back map to THEIR lead; the Inbox
   * shows that binding and links to it, so the same message reads as "a
   * reply on my lead" to the seller and "awaiting a reply" to the desk.
   */
  entity?: { type: string; id: string } | null;
}

// ─── Email ───────────────────────────────────────────────────────────────────

export interface EmailThreadRow {
  thread_key: string;
  subject: string | null;
  last_message_at: string;
  message_count: number | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
}
export interface EmailMessageRow {
  thread_id: string | null;
  direction: string | null;
  sender: string | null;
  recipient: string | null;
  body_text: string | null;
  created_at: string;
  status?: string | null;
}

export function emailItems(threads: EmailThreadRow[], messages: EmailMessageRow[]): InboxItem[] {
  // Latest message per thread decides whose turn it is.
  const latest = new Map<string, EmailMessageRow>();
  for (const m of messages) {
    if (!m.thread_id) continue;
    const cur = latest.get(m.thread_id);
    if (!cur || m.created_at > cur.created_at) latest.set(m.thread_id, m);
  }
  return threads.map((t) => {
    const last = latest.get(t.thread_key);
    const inboundLast = last?.direction === 'inbound';
    const who = inboundLast ? (last?.sender ?? '') : (last?.recipient ?? '');
    const entity = t.related_entity_type && t.related_entity_id
      ? { type: t.related_entity_type, id: t.related_entity_id }
      : null;
    const onLead = entity ? ` on ${entity.type === 'lead' ? 'a lead' : entity.type}` : '';
    return {
      key: `email:${t.thread_key}`,
      channel: 'email',
      state: last ? (inboundLast ? 'human' : 'customer') : 'done',
      reason: last
        ? (inboundLast ? `reply in${onLead || ' — awaiting an answer'}` : `sent${onLead} — waiting on them`)
        : 'no messages',
      who,
      subject: t.subject || '(no subject)',
      preview: last?.body_text?.replace(/\s+/g, ' ').slice(0, 140) ?? null,
      at: t.last_message_at,
      href: `/admin/email?tab=threads&thread=${encodeURIComponent(t.thread_key)}`,
      entity,
    };
  });
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatConversationRow {
  id: string;
  title: string | null;
  conversation_status: string | null;
  priority: string | null;
  assigned_agent_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  escalation_reason: string | null;
  channel: string | null;
  updated_at: string;
}

export function chatItems(rows: ChatConversationRow[]): InboxItem[] {
  return rows.map((c) => {
    const s = c.conversation_status ?? 'active';
    let state: InboxState = 'agent';
    let reason = 'FlowPilot is answering';
    if (s === 'waiting_agent') { state = 'human'; reason = 'visitor asked for a person'; }
    else if (s === 'escalated') { state = 'human'; reason = c.escalation_reason ? `escalated: ${c.escalation_reason}` : 'escalated by FlowPilot'; }
    else if (s === 'with_agent') { state = 'human'; reason = 'with a colleague'; }
    else if (s === 'closed' || s === 'resolved') { state = 'done'; reason = 'closed'; }
    return {
      key: `chat:${c.id}`,
      channel: 'chat',
      state,
      reason,
      who: c.customer_name || c.customer_email || 'Visitor',
      subject: c.title || 'Chat conversation',
      at: c.updated_at,
      href: `/admin/live-support?conversation=${c.id}`,
      priority: c.priority,
      assignedTo: c.assigned_agent_id,
    };
  });
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export interface TicketRow {
  id: string;
  ticket_number: number | string | null;
  subject: string;
  status: string;
  priority: string | null;
  assigned_to: string | null;
  contact_name: string | null;
  contact_email: string | null;
  source: string | null;
  updated_at: string;
}

export function ticketItems(rows: TicketRow[]): InboxItem[] {
  return rows.map((t) => {
    let state: InboxState = 'human';
    let reason = t.assigned_to ? 'assigned' : 'unassigned';
    if (t.status === 'waiting') { state = 'customer'; reason = 'waiting on the customer'; }
    else if (t.status === 'resolved' || t.status === 'closed') { state = 'done'; reason = t.status; }
    else if (t.status === 'new') { reason = t.source === 'email' ? 'FlowPilot opened it from an email' : 'new ticket'; }
    return {
      key: `ticket:${t.id}`,
      channel: 'ticket',
      state,
      reason,
      who: t.contact_name || t.contact_email || '—',
      subject: `${t.ticket_number ? `#${t.ticket_number} ` : ''}${t.subject}`,
      at: t.updated_at,
      href: `/admin/tickets?ticket=${t.id}`,
      priority: t.priority,
      assignedTo: t.assigned_to,
    };
  });
}

// ─── Forms ───────────────────────────────────────────────────────────────────

export interface FormSubmissionRow {
  id: string;
  form_name: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  handled_at: string | null;
  lead_id: string | null;
}

function guessWho(data: Record<string, unknown> | null): string {
  if (!data) return '—';
  for (const k of ['name', 'full_name', 'fullName', 'email', 'company']) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const firstString = Object.values(data).find((v) => typeof v === 'string' && (v as string).trim());
  return (firstString as string | undefined)?.trim().slice(0, 60) ?? '—';
}

export function formItems(rows: FormSubmissionRow[]): InboxItem[] {
  return rows.map((f) => ({
    key: `form:${f.id}`,
    channel: 'form',
    state: f.handled_at ? 'done' : 'human',
    reason: f.handled_at ? 'handled' : (f.lead_id ? 'FlowPilot created the lead — needs a follow-up' : 'new submission'),
    who: guessWho(f.data),
    subject: f.form_name || 'Form submission',
    preview: f.data ? Object.entries(f.data).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 140) : null,
    at: f.created_at,
    href: f.lead_id ? `/admin/contacts?lead=${f.lead_id}` : '/admin/forms',
  }));
}

// ─── Voice ───────────────────────────────────────────────────────────────────

export interface VoiceCallRow {
  id: string;
  direction: string | null;
  status: string | null;
  from_number: string | null;
  to_number: string | null;
  started_at: string | null;
  voicemail: boolean | null;
  callback_status: string | null;
  ai_handled: boolean | null;
  ai_summary: string | null;
  created_at: string;
}

export function voiceItems(rows: VoiceCallRow[]): InboxItem[] {
  return rows.map((v) => {
    let state: InboxState = 'done';
    let reason = v.status ?? 'call';
    if (v.callback_status === 'pending' || v.callback_status === 'scheduled') { state = 'human'; reason = `callback ${v.callback_status}`; }
    else if (v.voicemail) { state = 'human'; reason = 'voicemail to listen to'; }
    else if (v.ai_handled) { state = 'agent'; reason = 'FlowPilot took the call'; }
    else if (v.status === 'missed' || v.status === 'no_answer') { state = 'human'; reason = 'missed call'; }
    return {
      key: `voice:${v.id}`,
      channel: 'voice',
      state,
      reason,
      who: (v.direction === 'inbound' ? v.from_number : v.to_number) || '—',
      subject: v.ai_summary?.slice(0, 120) || (v.direction === 'inbound' ? 'Incoming call' : 'Outgoing call'),
      at: v.started_at || v.created_at,
      href: v.voicemail ? '/admin/live-support?tab=voicemail' : '/admin/live-support?tab=callbacks',
    };
  });
}

// ─── Queue ───────────────────────────────────────────────────────────────────

export const STATE_ORDER: InboxState[] = ['human', 'agent', 'customer', 'done'];

/** Newest first within a state; the caller groups by state. */
export function sortQueue(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
