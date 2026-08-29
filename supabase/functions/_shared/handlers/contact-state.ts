// The standing picture — the balance to the ledger.
//
// The activity log is the sales ledger: entries are short, immutable and
// complete-as-far-as-they-go. Nobody reads a ledger; they read the balance.
// A salesperson carrying twenty leads cannot re-read sixty notes, so this
// distils the whole ledger for one contact into a few sentences that answer
// one question: where do we stand right now.
//
// Three rules the prompt below enforces, each earned the hard way:
//
// 1. Grounded only in the ledger. Not "a plausible sales situation" — THIS
//    contact's entries. An invented next step is worse than no summary,
//    because it reads exactly like a real one.
// 2. It replaces itself. The summary is state, not history; history is the
//    ledger, which is right there. Appending would rebuild the pile this
//    feature exists to remove.
// 3. It says what it rests on. A sales ledger is inherently incomplete —
//    conversations happen in corridors and phone calls — so the basis
//    (entries counted, through which date) is stored with the text and shown
//    beside it. A balance that looks authoritative while missing entries is
//    more dangerous than no balance.
//
// Soft-fail (Law 4): no AI provider, no activities, or a malformed response
// leaves the existing summary untouched and reports why. A stale summary the
// operator can date is better than a blank panel that says nothing happened.

import { resolveAiConfig } from '../ai-config.ts';
import { callAiCompletion } from '../ai-usage-logger.ts';
import { loadBusinessIdentityBlock } from '../domains/business-identity-block.ts';

interface LedgerEntry {
  type: string;
  created_at: string;
  note: string;
}

/** The human-readable body, whichever key the writer of the day used (#334). */
function entryText(metadata: unknown): string {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const raw = (m.note ?? m.description ?? m.text ?? '') as unknown;
  return typeof raw === 'string' ? raw.trim() : '';
}

export async function distillContactState(
  supabase: any,
  leadId: string,
): Promise<{ success: boolean; summary?: string; entries?: number; skipped?: string }> {
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, name, email, status, score, company, company_id, companies(name, notes)')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) throw new Error(`contact-state: lead read failed: ${leadErr.message}`);
  if (!lead) throw new Error('contact-state: no such contact');

  const { data: rows, error: actErr } = await supabase
    .from('lead_activities')
    .select('type, created_at, metadata')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (actErr) throw new Error(`contact-state: ledger read failed: ${actErr.message}`);

  const entries: LedgerEntry[] = (rows ?? []).map((r: any) => ({
    type: r.type,
    created_at: r.created_at,
    note: entryText(r.metadata),
  }));

  if (entries.length === 0) {
    return { success: true, skipped: 'the ledger is empty — nothing to summarise' };
  }

  const ai = await resolveAiConfig(supabase, 'fast');
  // 'core': the writer needs to know what we sell and to whom in order to say
  // where a contact stands in relation to it. The wide projection would invite
  // importing our marketing claims into a factual status note.
  const identity = await loadBusinessIdentityBlock(supabase, 'core');

  const companyName = lead.companies?.name || lead.company || null;
  const companyNotes = (lead.companies?.notes ?? '').toString().trim();

  const ledgerText = entries
    .map((e) => `${e.created_at.slice(0, 10)} · ${e.type}${e.note ? `: ${e.note}` : ''}`)
    .join('\n')
    .slice(0, 12000);

  const result = await callAiCompletion({
    supabase,
    source: 'contact-state',
    provider: ai.provider, model: ai.model, apiUrl: ai.apiUrl, apiKey: ai.apiKey,
    metadata: { lead_id: leadId, entries: entries.length },
    body: {
      messages: [
        {
          role: 'system',
          content:
            'You keep one short standing note per contact in a CRM, answering exactly one ' +
            'question: where do we stand with this contact right now.\n\n' +
            'Rules:\n' +
            '- Ground every sentence in the ledger entries you are given. Never infer a ' +
            'situation that the entries do not show, and never invent a next step. If the ' +
            'entries are thin, say plainly that little is recorded — that is useful.\n' +
            '- Write the CURRENT state, not a chronicle. The history is in the ledger right ' +
            'next to this note; repeating it wastes the reader.\n' +
            '- At most four sentences. This is read while scanning twenty contacts.\n' +
            '- Write in the language the entries are written in.\n' +
            '- Plain prose, no headings, no bullet lists, no salutation.' +
            (identity
              ? identity +
                '\n\nUse the identity above only to judge what matters about where this ' +
                'contact stands. Never import our claims into the note: it describes THEM ' +
                'and our dealings with them, nothing we would like to be true.'
              : ''),
        },
        {
          role: 'user',
          content:
            `Contact: ${lead.name || lead.email}\n` +
            (companyName ? `Company: ${companyName}\n` : '') +
            `Status: ${lead.status} · score ${lead.score}\n` +
            (companyNotes ? `\nWhat we know about the company:\n${companyNotes.slice(0, 1500)}\n` : '') +
            `\nLedger (${entries.length} entries, oldest first):\n${ledgerText}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
    },
  });

  const summary = (result?.choices?.[0]?.message?.content ?? '').trim();
  if (!summary) {
    return { success: false, skipped: 'the model returned nothing — previous summary kept' };
  }

  const through = entries[entries.length - 1].created_at;
  // Read the row back: an update that matched nothing must never be reported
  // as a fresh summary.
  const { data: written, error: writeErr } = await supabase
    .from('leads')
    .update({
      ai_summary: summary,
      ai_summary_at: new Date().toISOString(),
      ai_summary_basis: { entries: entries.length, through, model: ai.model },
    })
    .eq('id', leadId)
    .select('id');
  if (writeErr) throw new Error(`contact-state: write failed: ${writeErr.message}`);
  if (!written?.length) throw new Error('contact-state: nothing was written — check permissions');

  return { success: true, summary, entries: entries.length };
}

/**
 * Sweep: contacts whose ledger has moved since their summary was written.
 * Same shape as qualify_lead's sweep so an automation can call either without
 * learning a second convention. Bounded — a sweep that re-summarises the whole
 * base on every run is a bill, not a feature.
 */
export async function executeDistillContactState(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const leadId = typeof args.leadId === 'string' ? args.leadId : undefined;
  if (leadId) return await distillContactState(supabase, leadId);

  const limit = Math.min(Number(args.limit) || 10, 25);
  const { data: candidates, error } = await supabase
    .from('leads')
    .select('id, ai_summary_at, updated_at')
    .neq('status', 'prospect')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`contact-state sweep: ${error.message}`);

  const stale: string[] = [];
  for (const c of candidates ?? []) {
    const { count } = await supabase
      .from('lead_activities')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', c.id)
      .gt('created_at', c.ai_summary_at ?? '1970-01-01');
    if ((count ?? 0) > 0) stale.push(c.id);
    if (stale.length >= limit) break;
  }

  const results: Array<Record<string, unknown>> = [];
  for (const id of stale) {
    try {
      results.push({ lead_id: id, ...(await distillContactState(supabase, id)) });
    } catch (e) {
      // One contact's failure must not end the sweep — report it and continue.
      results.push({ lead_id: id, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { success: true, summarised: results.filter((r) => r.success).length, checked: stale.length, results };
}
