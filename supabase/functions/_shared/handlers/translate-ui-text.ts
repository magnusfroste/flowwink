/**
 * translate_ui_text — the strings AROUND the content, into a new language.
 *
 * `site_settings.ui_text` is one blob: flat keys are the site's own language,
 * `@<locale>` keys are overlays (docs/architecture/language.md §3). Every key
 * the product can show is in the catalogue the code generates
 * (src/data/ui-text-catalog.json, bundled into agent-execute), each with its
 * English from the call site. This fills the `@<locale>` overlay for the keys
 * that have no translation yet, so a site that just added Swedish gets a
 * Swedish cookie banner, form buttons and chat labels in one call — and the
 * admin editor under Site Settings → Language & text shows exactly what was
 * written, ready to be corrected.
 */
import { batchStrings } from '../i18n/translate-walk.ts';
import { translateAll } from '../i18n/translate.ts';

export interface UiTextCatalog {
  keys: Array<{ key: string; group?: string; fallback: string }>;
}

export interface TranslateUiTextArgs {
  /** Target language tag, e.g. "sv". */
  locale: string;
  /** Source language for the strings. Default: the site's own language, else English from the code. */
  from?: string;
  /** Retranslate keys that already have a value in the overlay. Default false. */
  overwrite?: boolean;
  /** Only keys starting with this prefix, e.g. "chat." or "form.". */
  prefix?: string;
  dry_run?: boolean;
  context?: string;
  /** Seconds this call may spend (default 60, at most 110). What is left is answered as `remaining`. */
  budget_seconds?: number;
}

/** Batches sent to the model at the same time. */
export const UI_TEXT_PARALLEL = 3;

export async function handleTranslateUiText(
  supabase: any,
  args: TranslateUiTextArgs,
  catalog: UiTextCatalog,
): Promise<Record<string, unknown>> {
  const to = String(args.locale ?? '').trim().toLowerCase();
  if (!/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(to)) {
    return { success: false, error: `locale must be a language tag like "sv" or "en-GB" (got "${args.locale}").` };
  }

  const { data: langRow, error: langErr } = await supabase.from('site_settings').select('value').eq('key', 'site_languages').maybeSingle();
  if (langErr) throw new Error(`site_languages read failed: ${langErr.message}`);
  const siteDefault = String((langRow?.value as any)?.default ?? 'en').toLowerCase();
  const enabled: string[] = Array.isArray((langRow?.value as any)?.enabled) ? (langRow!.value as any).enabled : [];

  const { data: uiRow, error: uiErr } = await supabase.from('site_settings').select('value').eq('key', 'ui_text').maybeSingle();
  if (uiErr) throw new Error(`ui_text read failed: ${uiErr.message}`);
  const blob: Record<string, any> = (uiRow?.value && typeof uiRow.value === 'object') ? { ...(uiRow.value as any) } : {};

  const from = String(args.from ?? siteDefault).toLowerCase();
  const fromOverlay: Record<string, string> = from === siteDefault ? {} : (blob[`@${from}`] ?? {});
  const existing: Record<string, string> = { ...(blob[`@${to}`] ?? {}) };
  const prefix = args.prefix ? String(args.prefix) : '';

  const todo: Array<{ key: string; text: string }> = [];
  for (const entry of catalog.keys ?? []) {
    if (prefix && !entry.key.startsWith(prefix)) continue;
    if (!args.overwrite && typeof existing[entry.key] === 'string' && existing[entry.key].trim()) continue;
    const text =
      (typeof fromOverlay[entry.key] === 'string' && fromOverlay[entry.key].trim() && fromOverlay[entry.key]) ||
      (from === siteDefault && typeof blob[entry.key] === 'string' && blob[entry.key].trim() && blob[entry.key]) ||
      entry.fallback;
    if (typeof text === 'string' && text.trim()) todo.push({ key: entry.key, text });
  }

  const numbered = todo.map((t, i) => ({ i, text: t.text }));
  const batches = batchStrings(numbered, 60, 6000);

  if (args.dry_run) {
    return {
      success: true, dry_run: true, locale: to, from, keys_in_catalog: (catalog.keys ?? []).length,
      already_translated: Object.keys(existing).length, to_translate: todo.length, batches: batches.length,
      sample: todo.slice(0, 8).map((t) => `${t.key}: ${t.text.slice(0, 60)}`),
      note: 'Nothing was written.',
    };
  }
  if (!todo.length) {
    return { success: true, locale: to, translated: 0, already_translated: Object.keys(existing).length, note: `Every key already has a ${to} translation.` };
  }

  // In waves, saved as it goes, inside a time budget (2026-11-21). The whole
  // catalogue is 1 300 strings — over two minutes at 60 a call — and it used to
  // be saved once, at the end: on sandbox the worker was stopped after six
  // batches and all 360 translated strings were lost, paid for and thrown away.
  // A call now does what fits, keeps what it did, and says what is left.
  const budgetMs = Math.max(5, Math.min(Number(args.budget_seconds ?? 60) || 60, 110)) * 1000;
  const deadline = Date.now() + budgetMs;
  const overlay: Record<string, string> = { ...existing };
  const untranslated: number[] = [];
  let written = 0;
  let batchesDone = 0;
  let slowestWave = 0;
  for (let w = 0; w < batches.length; w += UI_TEXT_PARALLEL) {
    if (w > 0 && Date.now() + slowestWave > deadline) break;
    const wave = batches.slice(w, w + UI_TEXT_PARALLEL);
    const t0 = Date.now();
    const results = await Promise.all(wave.map((batch) =>
      translateAll(supabase, batch, { to, from, context: args.context, source: 'translate_ui_text' }, [batch])
        .catch((err) => ({ translations: new Map<number, string>(), untranslated: batch.map((it) => it.i), batches: 1, error: err as Error }))));
    slowestWave = Math.max(slowestWave, Date.now() - t0);
    const failure = results.find((r) => 'error' in r) as { error: Error } | undefined;
    for (const r of results) {
      for (const [i, tr] of r.translations) { overlay[todo[i].key] = tr; written += 1; }
      untranslated.push(...r.untranslated);
    }
    batchesDone += wave.length;
    blob[`@${to}`] = overlay;
    const { data: saved, error: saveErr } = await supabase
      .from('site_settings')
      .upsert({ key: 'ui_text', value: blob, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select('key')
      .maybeSingle();
    if (saveErr) return { success: false, error: `ui_text write failed: ${saveErr.message}`, translated: written };
    if (!saved) return { success: false, error: 'ui_text did not save.', translated: written };
    // A wave that translated nothing and raised is the provider, not the text.
    if (failure && results.every((r) => r.translations.size === 0)) {
      return { success: false, error: failure.error.message, translated: written, remaining: todo.length - written };
    }
  }
  const remaining = batches.slice(batchesDone).reduce((n, b) => n + b.length, 0);

  return {
    success: true,
    locale: to,
    from,
    translated: written,
    untranslated: untranslated.length,
    // Strings this call did not reach before its time ran out: call again.
    remaining,
    complete: remaining === 0,
    overlay_size: Object.keys(overlay).length,
    batches: batchesDone,
    batches_total: batches.length,
    ...(enabled.length && !enabled.includes(to) ? { note: `"${to}" is not in site_languages.enabled yet — add it under Site Settings → Language & text, or the overlay is never shown.` } : {}),
    review: 'Site Settings → Language & text shows every key with its translation; correct there.',
  };
}
