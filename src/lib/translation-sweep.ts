/**
 * What the admin says about a language being translated (translate_site).
 * The record is `site_settings.translation_sweep`, written by the skill:
 * { "<locale>": { status, translated, remaining, ui_done, failed[], … } }.
 */
export interface LocaleSweepView {
  status: 'running' | 'done' | 'stuck';
  translated?: number;
  remaining?: number;
  ui_done?: boolean;
  failed?: Array<{ entity: string; slug: string; error: string }>;
  last_run_at?: string;
}

export type SweepView = Record<string, LocaleSweepView>;

export function sweepFor(state: unknown, locale: string): LocaleSweepView | null {
  if (!state || typeof state !== 'object') return null;
  const s = (state as Record<string, unknown>)[locale];
  if (!s || typeof s !== 'object') return null;
  const status = (s as { status?: unknown }).status;
  return status === 'running' || status === 'done' || status === 'stuck' ? (s as LocaleSweepView) : null;
}

/** One line for the language chip; null when there is nothing to say. */
export function sweepLine(s: LocaleSweepView | null): string | null {
  if (!s) return null;
  const done = s.translated ?? 0;
  const left = s.remaining ?? 0;
  if (s.status === 'done') return `Translated · ${done} item${done === 1 ? '' : 's'}`;
  if (s.status === 'stuck') {
    const why = s.failed?.[0]?.error;
    return `Stopped — ${why ? why.slice(0, 120) : 'nothing could be translated'}`;
  }
  return `Translating · ${done} done, ${left} left${s.ui_done === false && left === 0 ? ', interface texts next' : ''} — continues on the server`;
}

export function anyRunning(state: unknown): boolean {
  if (!state || typeof state !== 'object') return false;
  return Object.values(state as Record<string, { status?: unknown }>).some((s) => s?.status === 'running');
}
