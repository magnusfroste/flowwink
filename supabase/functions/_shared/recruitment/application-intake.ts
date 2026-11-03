/**
 * What a candidate's application must carry before it becomes one — the one
 * rule the careers page, the job-listings block, FlowPilot and an MCP agent
 * share (process-job-application applies it; the public form mirrors it).
 *
 * - Consent: the candidate agrees that the business keeps their application
 *   for the role (GDPR art. 6/7). Without it nothing is stored.
 * - Screening questions live on the posting (`job_postings.meta.screening_questions`):
 *   [{ id, label, type: 'yes_no' | 'text' | 'choice', options?, required?, knockout? }].
 *   A required question must be answered. A `knockout` answer ("no" to
 *   "Do you hold a B driving licence?") does NOT reject anyone: it is recorded
 *   and shown to the recruiter — a person decides, the form never does.
 *
 * Pure — no Deno, no Supabase — so vitest exercises it directly.
 */

export type ScreeningType = 'yes_no' | 'text' | 'choice';

export interface ScreeningQuestion {
  id: string;
  label: string;
  type: ScreeningType;
  options?: string[];
  required?: boolean;
  /** The answer that flags the candidate for the recruiter (never auto-rejects). */
  knockout?: string;
}

export type IntakeResult =
  | { ok: true; answers: Record<string, string>; knockouts: string[] }
  | { ok: false; code: 'CONSENT_REQUIRED' | 'ANSWER_REQUIRED' | 'INVALID_INPUT'; message: string; missing?: string[] };

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'boolean' ? (v ? 'yes' : 'no') : '');

/** The posting's questions, cleaned: unknown shapes are dropped, never trusted. */
export function screeningQuestionsOf(meta: unknown): ScreeningQuestion[] {
  const raw = (meta as { screening_questions?: unknown } | null)?.screening_questions;
  if (!Array.isArray(raw)) return [];
  const out: ScreeningQuestion[] = [];
  for (const q of raw) {
    const id = str((q as { id?: unknown })?.id);
    const label = str((q as { label?: unknown })?.label);
    const t = str((q as { type?: unknown })?.type) as ScreeningType;
    if (!id || !label || !['yes_no', 'text', 'choice'].includes(t)) continue;
    const options = Array.isArray((q as { options?: unknown }).options)
      ? ((q as { options: unknown[] }).options.map(str).filter(Boolean))
      : undefined;
    out.push({
      id, label, type: t,
      ...(t === 'choice' && options?.length ? { options } : {}),
      required: (q as { required?: unknown }).required === true,
      ...(str((q as { knockout?: unknown }).knockout) ? { knockout: str((q as { knockout?: unknown }).knockout) } : {}),
    });
  }
  return out;
}

export function assessApplication(input: {
  questions: ScreeningQuestion[];
  answers: unknown;
  consent: unknown;
}): IntakeResult {
  if (input.consent !== true) {
    return { ok: false, code: 'CONSENT_REQUIRED', message: 'The candidate must consent to the business keeping their application (consent: true).' };
  }
  const given = (input.answers && typeof input.answers === 'object' ? input.answers : {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  const missing: string[] = [];
  const knockouts: string[] = [];
  for (const q of input.questions) {
    let a = str(given[q.id]).slice(0, 2000);
    if (q.type === 'yes_no' && a) a = /^(yes|ja|true|y|j)$/i.test(a) ? 'yes' : /^(no|nej|false|n)$/i.test(a) ? 'no' : a;
    if (q.type === 'yes_no' && a && a !== 'yes' && a !== 'no') {
      return { ok: false, code: 'INVALID_INPUT', message: `"${q.label}" is answered yes or no.` };
    }
    if (q.type === 'choice' && a && q.options?.length && !q.options.includes(a)) {
      return { ok: false, code: 'INVALID_INPUT', message: `"${q.label}" is one of: ${q.options.join(', ')}.` };
    }
    if (!a) {
      if (q.required) missing.push(q.label);
      continue;
    }
    answers[q.id] = a;
    if (q.knockout && a.toLowerCase() === q.knockout.toLowerCase()) knockouts.push(q.label);
  }
  if (missing.length) {
    return { ok: false, code: 'ANSWER_REQUIRED', message: `Answer: ${missing.join(', ')}.`, missing };
  }
  return { ok: true, answers, knockouts };
}

/** An e-mail address worth storing — the form checks it too, the server decides. */
export function plausibleEmail(v: unknown): boolean {
  const s = str(v);
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Only the careers upload area — the service role must never fetch a path a visitor chose. */
export const APPLICATION_UPLOAD_PREFIX = 'form-uploads/applications/';
export function safeUploadPath(v: unknown): string | null {
  const s = str(v);
  return s.startsWith(APPLICATION_UPLOAD_PREFIX) && !s.includes('..') && s.length < 400 ? s : null;
}
