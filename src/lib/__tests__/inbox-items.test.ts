import { describe, it, expect } from 'vitest';
import { emailItems, chatItems, ticketItems, formItems, voiceItems, sortQueue, attachSteps } from '../inbox-items';

describe('Inbox — one queue, organised by who has it', () => {
  it('email: the latest message decides whose turn it is', () => {
    const items = emailItems(
      [
        { thread_key: 't1', subject: 'Offert', last_message_at: '2026-09-02T10:00:00Z', message_count: 2 },
        { thread_key: 't2', subject: 'Hej', last_message_at: '2026-09-02T09:00:00Z', message_count: 2 },
      ],
      [
        { thread_id: 't1', direction: 'inbound', sender: 'anna@x.se', recipient: null, body_text: 'Kan ni?', created_at: '2026-09-02T10:00:00Z' },
        { thread_id: 't1', direction: 'outbound', sender: null, recipient: 'anna@x.se', body_text: 'Hej', created_at: '2026-09-01T10:00:00Z' },
        { thread_id: 't2', direction: 'outbound', sender: null, recipient: 'bo@y.se', body_text: 'Svar', created_at: '2026-09-02T09:00:00Z' },
      ],
    );
    expect(items.find((i) => i.key === 'email:t1')?.state).toBe('human');
    expect(items.find((i) => i.key === 'email:t1')?.who).toBe('anna@x.se');
    expect(items.find((i) => i.key === 'email:t2')?.state).toBe('customer');
  });

  it('chat: FlowPilot has it unless a person was asked for, escalated, or already on it', () => {
    const base = { title: null, priority: null, assigned_agent_id: null, customer_email: null, customer_name: 'Eva', escalation_reason: null, channel: 'web', updated_at: '2026-09-02T10:00:00Z' };
    const s = (conversation_status: string) => chatItems([{ id: 'c', conversation_status, ...base }])[0];
    expect(s('active').state).toBe('agent');
    expect(s('waiting_agent').state).toBe('human');
    expect(s('escalated').state).toBe('human');
    expect(s('with_agent').state).toBe('human');
    expect(s('closed').state).toBe('done');
  });

  it('tickets: waiting is the customer’s turn, resolved/closed is done, the rest needs a person', () => {
    const t = (status: string, assigned_to: string | null = null) => ticketItems([{ id: 'k', ticket_number: 7, subject: 'Faktura', status, priority: 'normal', assigned_to, contact_name: 'Bo', contact_email: null, source: 'email', updated_at: '2026-09-02T10:00:00Z' }])[0];
    expect(t('new').state).toBe('human');
    expect(t('new').reason).toContain('FlowPilot');
    expect(t('waiting').state).toBe('customer');
    expect(t('closed').state).toBe('done');
    expect(t('open', 'u1').assignedTo).toBe('u1');
  });

  it('forms: unhandled needs a person; a lead FlowPilot created says so', () => {
    const f = formItems([{ id: 'f', form_name: 'Brief', data: { name: 'Anna', email: 'a@x.se' }, created_at: '2026-09-02T10:00:00Z', handled_at: null, lead_id: 'L1' }])[0];
    expect(f.state).toBe('human');
    expect(f.who).toBe('Anna');
    expect(f.reason).toContain('FlowPilot created the lead');
    expect(f.href).toContain('L1');
  });

  it('voice: callbacks and voicemail need a person, an AI-handled call is the agent’s, others are done', () => {
    const v = (over: Partial<Parameters<typeof voiceItems>[0][0]>) => voiceItems([{ id: 'v', direction: 'inbound', status: 'completed', from_number: '+46', to_number: null, started_at: '2026-09-02T10:00:00Z', voicemail: false, callback_status: 'none', ai_handled: false, ai_summary: null, created_at: '2026-09-02T10:00:00Z', ...over }])[0];
    expect(v({ callback_status: 'pending' }).state).toBe('human');
    expect(v({ voicemail: true }).state).toBe('human');
    expect(v({ ai_handled: true }).state).toBe('agent');
    expect(v({}).state).toBe('done');
  });

  it('the queue is newest first', () => {
    const q = sortQueue([
      { key: 'a', channel: 'email', state: 'human', reason: '', who: '', subject: '', at: '2026-09-01T00:00:00Z', href: '' },
      { key: 'b', channel: 'chat', state: 'human', reason: '', who: '', subject: '', at: '2026-09-02T00:00:00Z', href: '' },
    ]);
    expect(q.map((i) => i.key)).toEqual(['b', 'a']);
  });
});

describe('FlowPilot’s steps ride on the row — no hidden steps', () => {
  it('matches activity by conversation id and by any of the item’s ids in input/output, newest last, capped', () => {
    const chat = chatItems([{ id: 'conv-1111', title: null, conversation_status: 'active', priority: null, assigned_agent_id: null, customer_email: null, customer_name: 'Eva', escalation_reason: null, channel: 'web', updated_at: '2026-09-02T10:00:00Z' }]);
    const form = formItems([{ id: 'form-2222', form_name: 'Brief', data: { email: 'a@x.se' }, created_at: '2026-09-02T09:00:00Z', handled_at: null, lead_id: 'lead-3333' }]);
    const activity = [
      { id: 'a1', created_at: '2026-09-02T10:01:00Z', agent: 'flowpilot', skill_name: 'search_knowledge', status: 'success', conversation_id: 'conv-1111', input: { q: 'pricing' }, output: { message: 'Found 3 articles' } },
      { id: 'a2', created_at: '2026-09-02T09:05:00Z', agent: 'flowpilot', skill_name: 'qualify_lead', status: 'success', conversation_id: null, input: { lead_id: 'lead-3333' }, output: { score: 72 } },
      { id: 'a3', created_at: '2026-09-02T09:01:00Z', agent: 'flowpilot', skill_name: 'ensure_lead_partner', status: 'success', conversation_id: null, input: { lead_id: 'lead-3333' }, output: {} },
      { id: 'a4', created_at: '2026-09-02T08:00:00Z', agent: 'mcp', skill_name: 'manage_page', status: 'success', conversation_id: null, input: { slug: 'home' }, output: {} },
    ];
    const [c] = attachSteps(chat, activity);
    const [f] = attachSteps(form, activity);
    expect(c.steps?.map((s) => s.skill)).toEqual(['search_knowledge']);
    expect(c.steps?.[0].summary).toBe('Found 3 articles');
    expect(f.steps?.map((s) => s.skill)).toEqual(['ensure_lead_partner', 'qualify_lead']);
    expect(attachSteps(chat, activity, 1)[0].steps).toHaveLength(1);
    expect(attachSteps(chat, [])[0].steps).toBeUndefined();
  });
});
