/**
 * The evidence for an email reply — why FlowPilot answered as it did, kept
 * with the answer.
 *
 * A chat answer is judged on the spot: the visitor reads it, thumbs it up or
 * down, asks again. An email answer is judged by nobody — the sender reads it
 * days later, no thumb, no follow-up. So the judgement has to be possible
 * AFTERWARDS, from the record: what was asked, what the answer was built on
 * (the grounding receipt — KB, pages, live data, or nothing but the model),
 * which knowledge the responder was ALLOWED to use at the time (the chat
 * settings — the same dials govern email), what happened to the answer
 * (sent, drafted, held for a person, waiting for approval) and, in one
 * sentence, why.
 *
 * Lands in outbound_communications.metadata.evidence on the draft and on the
 * sent row alike. Metadata only, never chunk text. Pure, so vitest tests it.
 */

import type { GroundingReceipt, GroundingSource } from '../retrieval/receipt.ts';

export type ReplyDecision =
  | 'sent'
  | 'drafted'
  | 'held_for_person'
  | 'awaiting_approval'
  | 'send_failed';

export type AnsweredFrom = 'knowledge' | 'live_data' | 'model_only';

export interface KnowledgeDials {
  /** Chat settings → Knowledge: KB articles in the context. */
  kb: boolean;
  /** Chat settings → Knowledge: website pages in the context. */
  pages: boolean;
  /** Chat settings → Advanced: the model may use its own knowledge. */
  general: boolean;
}

export interface ReplyEvidence {
  v: 1;
  /** The question as it arrived, first 300 characters. */
  question: string;
  answered_from: AnsweredFrom;
  grounded: boolean;
  sources: GroundingSource[];
  /** The knowledge the responder was allowed to use when it answered. */
  knowledge: KnowledgeDials | null;
  reply_mode: 'ai_first' | 'human_first' | 'human_only';
  decision: ReplyDecision;
  /** One sentence a person can read in FlowBox. */
  why: string;
  needs_person: boolean;
  trust_level?: string | null;
  send_error?: string | null;
  responder: 'chat-completion';
  at: string;
}

export interface EvidenceInput {
  question: string;
  grounding: GroundingReceipt | null | undefined;
  knowledge: KnowledgeDials | null;
  replyMode: ReplyEvidence['reply_mode'];
  decision: ReplyDecision;
  needsPerson: boolean;
  trustLevel?: string | null;
  sendError?: string | null;
  now?: Date;
}

export function answeredFrom(g: GroundingReceipt | null | undefined): AnsweredFrom {
  if (!g || !g.grounded) return 'model_only';
  return g.mode === 'skill' ? 'live_data' : 'knowledge';
}

const SOURCE_NAME: Record<string, string> = {
  kb_articles: 'KB',
  pages: 'pages',
  blog_posts: 'blog',
  wiki_pages: 'wiki',
  documents: 'documents',
};

function sourcesPhrase(sources: GroundingSource[]): string {
  const titles = sources.slice(0, 3).map((s) => `"${s.title}"`).join(', ');
  const kinds = [...new Set(sources.map((s) => SOURCE_NAME[s.table] ?? s.table))].join(' + ');
  return `${kinds}: ${titles}${sources.length > 3 ? ` and ${sources.length - 3} more` : ''}`;
}

/** Which knowledge was switched off — the honest half of "it found nothing". */
function dialsOff(k: KnowledgeDials | null): string {
  if (!k) return '';
  const off = [!k.kb && 'KB articles', !k.pages && 'website pages'].filter(Boolean) as string[];
  return off.length ? ` (${off.join(' and ')} ${off.length === 1 ? 'is' : 'are'} switched off in Chat settings → Knowledge)` : '';
}

export function buildReplyEvidence(input: EvidenceInput): ReplyEvidence {
  const g = input.grounding ?? null;
  const from = answeredFrom(g);
  const sources = g?.sources ?? [];

  const basis = from === 'knowledge'
    ? `Answered from ${sourcesPhrase(sources)}.`
    : from === 'live_data'
      ? 'Answered from live data a skill read at the time.'
      : `No source in the knowledge matched the question${dialsOff(input.knowledge)}${input.knowledge && !input.knowledge.general ? '' : '; the answer rests on the model alone'}.`;

  const outcome: Record<ReplyDecision, string> = {
    sent: 'Sent by FlowPilot — the mailbox answers AI first.',
    drafted: input.replyMode === 'human_first'
      ? 'Filed as a draft — the mailbox answers human first.'
      : 'Filed as a draft.',
    held_for_person: g?.grounded
      ? 'Held for a person: sources were found, but the responder judged they did not answer this question.'
      : 'Held for a person: nothing in the knowledge answered this question.',
    awaiting_approval: 'Waiting for approval — reply_to_email is on trust "approve".',
    send_failed: `Not sent — the email rail refused${input.sendError ? ` (${input.sendError.slice(0, 160)})` : ''}; filed as a draft.`,
  };

  return {
    v: 1,
    question: input.question.replace(/\s+/g, ' ').trim().slice(0, 300),
    answered_from: from,
    grounded: !!g?.grounded,
    sources,
    knowledge: input.knowledge,
    reply_mode: input.replyMode,
    decision: input.decision,
    why: `${basis} ${outcome[input.decision]}`,
    needs_person: input.needsPerson,
    ...(input.trustLevel !== undefined ? { trust_level: input.trustLevel } : {}),
    ...(input.sendError ? { send_error: input.sendError.slice(0, 300) } : {}),
    responder: 'chat-completion',
    at: (input.now ?? new Date()).toISOString(),
  };
}

/** The knowledge dials as chat-completion reads them (site_settings key 'chat'). */
export function knowledgeDialsFrom(chat: Record<string, unknown> | null | undefined): KnowledgeDials | null {
  if (!chat || typeof chat !== 'object') return null;
  return {
    kb: chat.includeKbArticles === true,
    pages: chat.includeContentAsContext === true,
    general: chat.allowGeneralKnowledge === true,
  };
}
