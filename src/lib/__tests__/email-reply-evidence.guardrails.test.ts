/**
 * An email reply is judged afterwards, from the record — nobody thumbs up an
 * email. So every FlowPilot reply keeps its evidence: what was asked, what
 * the answer rested on, which knowledge was switched on, what happened to it
 * and why (2026-10-30, after the reservdelar reply was held although the KB
 * said the parts exist in Sweden, and nobody could tell why).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildReplyEvidence, knowledgeDialsFrom, answeredFrom } from '../../../supabase/functions/_shared/email/reply-evidence.ts';

const read = (p: string) => readFileSync(p, 'utf8');
const kbOn = { kb: true, pages: false, general: false };
const receipt = (grounded: boolean, mode: 'retrieval' | 'none' | 'skill' = 'retrieval') => ({
  grounded, mode, chunk_count: grounded ? 2 : 0,
  sources: grounded ? [{ table: 'kb_articles', id: 'a1', title: 'Reservdelar i Sverige', slug: 'reservdelar', url: '/kb/reservdelar' }] : [],
});

describe('buildReplyEvidence', () => {
  it('names the sources an answer rested on', () => {
    const e = buildReplyEvidence({ question: 'Finns reservdelar  i Sverige?', grounding: receipt(true), knowledge: kbOn, replyMode: 'ai_first', decision: 'sent', needsPerson: false });
    expect(e.answered_from).toBe('knowledge');
    expect(e.why).toContain('"Reservdelar i Sverige"');
    expect(e.why).toContain('Sent by FlowPilot');
    expect(e.question).toBe('Finns reservdelar i Sverige?');
    expect(e.sources[0].url).toBe('/kb/reservdelar');
  });

  it('a held reply says whether sources were found or nothing matched', () => {
    const found = buildReplyEvidence({ question: 'q', grounding: receipt(true), knowledge: kbOn, replyMode: 'ai_first', decision: 'held_for_person', needsPerson: true });
    expect(found.why).toMatch(/sources were found, but the responder judged they did not answer/);
    const none = buildReplyEvidence({ question: 'q', grounding: receipt(false, 'none'), knowledge: kbOn, replyMode: 'ai_first', decision: 'held_for_person', needsPerson: true });
    expect(none.why).toMatch(/nothing in the knowledge answered/);
    expect(none.answered_from).toBe('model_only');
  });

  it('"found nothing" is told apart from "the KB was switched off"', () => {
    const e = buildReplyEvidence({ question: 'q', grounding: receipt(false, 'none'), knowledge: { kb: false, pages: false, general: true }, replyMode: 'human_first', decision: 'drafted', needsPerson: false });
    expect(e.why).toMatch(/KB articles and website pages are switched off in Chat settings → Knowledge/);
    expect(e.why).toMatch(/rests on the model alone/);
    expect(e.why).toMatch(/human first/);
  });

  it('live data is its own basis, and the dials are read as chat-completion reads them', () => {
    expect(answeredFrom(receipt(true, 'skill'))).toBe('live_data');
    expect(answeredFrom(null)).toBe('model_only');
    expect(knowledgeDialsFrom({ includeKbArticles: true })).toEqual({ kb: true, pages: false, general: false });
    expect(knowledgeDialsFrom(null)).toBeNull();
  });
});

describe('the evidence is kept on every path', () => {
  const draft = read('supabase/functions/_shared/handlers/draft-email-reply.ts');
  const reply = read('supabase/functions/_shared/handlers/reply-to-email.ts');

  it('draft-email-reply records a decision for each outcome', () => {
    for (const d of ["evidenceFor('sent')", "evidenceFor('awaiting_approval')", "evidenceFor('send_failed'", "evidenceFor(needsPerson ? 'held_for_person' : 'drafted')"]) {
      expect(draft).toContain(d);
    }
    expect(draft).toMatch(/\.eq\('key', 'chat'\)/);
  });

  it('a sent reply carries it to the row, on both rails', () => {
    expect(reply).toMatch(/extra_metadata: \{ evidence, grounding: args\._grounding \?\? null \}/);
    expect(reply).toMatch(/sent_by: args\._approved === true \? 'person' : 'flowpilot'/);
    expect(read('supabase/functions/email-send/index.ts')).toMatch(/extra_metadata: body\.extra_metadata \?\? undefined/);
    expect(read('supabase/functions/composio-proxy/index.ts')).toMatch(/\.\.\.\(extra_metadata && typeof extra_metadata === 'object' \? extra_metadata : \{\}\)/);
  });

  it('a person sending the draft is recorded, with whether they changed the text', () => {
    const ui = read('src/components/admin/email/ThreadReply.tsx');
    expect(ui).toMatch(/const edited = \(body: string\) => body\.trim\(\) !== \(draft\?\.body_text \?\? ''\)\.trim\(\)/);
    expect(ui).toMatch(/_evidence: \{ \.\.\.evidence, edited: edited\(body\) \}/);
    expect(ui).toMatch(/sent_by: 'person', edited: edited\(body\)/);
    expect(ui).toMatch(/<ReplyEvidence evidence=\{evidence\} \/>/);
    expect(read('src/pages/admin/EmailPage.tsx')).toMatch(/readEvidence\(m\.metadata\)/);
  });

  it('the chat settings say they govern email too', () => {
    expect(read('src/pages/admin/ChatSettingsPage.tsx')).toMatch(/the chat\s+widget, email replies and Telegram/);
    expect(read('src/components/admin/email/InboundMailboxesSection.tsx')).toMatch(/Chat settings → Knowledge/);
  });
});

describe('an approved reply is sent once, wherever it was approved', () => {
  it('approving under /admin/approvals spends the thread draft for that message', () => {
    const reply = read('supabase/functions/_shared/handlers/reply-to-email.ts');
    expect(reply).toMatch(/\} else if \(repliedTo && threadId\) \{/);
    expect(reply).toMatch(/\.eq\('metadata->>draft_of', repliedTo\)/);
  });

  it('a second Approve & send in the thread says "already sent" and sends nothing', () => {
    const ui = read('src/components/admin/email/ThreadReply.tsx');
    expect(ui).toMatch(/if \(r\?\.result\?\.skipped\) \{\s*await spendDraft\('used'\);\s*return 'already_sent' as const;/);
    expect(ui).toMatch(/Nothing was sent twice/);
  });

  it('the approval card links to the conversation, the thread names Approvals', () => {
    expect(read('src/components/admin/approvals/AgentSkillApprovalCard.tsx')).toMatch(/executingSkill === 'reply_to_email' && typeof args\.thread_id === 'string'/);
    expect(read('src/components/admin/approvals/AgentSkillApprovalCard.tsx')).toMatch(/\/admin\/email\?thread=\$\{encodeURIComponent\(args\.thread_id\)\}/);
    expect(read('src/components/admin/email/ThreadReply.tsx')).toMatch(/approve it here or under <Link to="\/admin\/approvals"/);
  });
});

describe('Approve & send in the thread approves first, then runs the ticket', () => {
  it('resolve_approval before agent-execute, which names the request', () => {
    const ui = read('src/components/admin/email/ThreadReply.tsx');
    const send = ui.slice(ui.indexOf('const sendStaged = async'), ui.indexOf('const discard = async'));
    expect(send.indexOf("rpc('resolve_approval'")).toBeGreaterThan(-1);
    expect(send.indexOf("rpc('resolve_approval'")).toBeLessThan(send.indexOf("invoke('agent-execute'"));
    expect(send).toMatch(/_approved: true, _approval_request_id: requestId/);
    expect(send).toMatch(/refusal\?\.reason === 'already_executed'/);
  });
});
