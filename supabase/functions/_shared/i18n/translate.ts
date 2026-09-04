/**
 * Batch translation through the instance's own AI configuration.
 *
 * Strings go in numbered; the model hands them back through a tool call with
 * the same numbers, so nothing can be reordered, merged or dropped without
 * the caller noticing. A missing number is reported as untranslated, never
 * silently kept — the count in the result is what a person reads to know
 * whether the page is done.
 */
import { resolveAiConfig } from '../ai-config.ts';
import { callAiCompletion } from '../ai-usage-logger.ts';

export interface NumberedString {
  i: number;
  text: string;
}

export interface TranslateOptions {
  /** Target language tag, e.g. "sv". */
  to: string;
  /** Source language tag; "auto" lets the model read it. */
  from?: string;
  /** Extra guidance: brand names, glossary, tone. */
  context?: string;
  /** Who is asking — lands on the ai_usage row. */
  source?: string;
}

export function languageName(tag: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(tag);
    if (name && name.toLowerCase() !== tag.toLowerCase()) return name;
  } catch {
    // Older runtimes: fall through to the tag itself.
  }
  return tag;
}

const KEEP_AS_IS = ['FlowWink', 'FlowPilot', 'FlowBox', 'FlowChat', 'FlowWork', 'MCP'];

/**
 * Translate one batch. Returns a map i → translated text for every item the
 * model delivered; items it did not deliver are absent (the caller counts them).
 */
export async function translateBatch(
  supabase: any,
  items: NumberedString[],
  opts: TranslateOptions,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!items.length) return out;
  const ai = await resolveAiConfig(supabase, 'fast');
  const from = opts.from && opts.from !== 'auto' ? languageName(opts.from) : 'the source language';
  const to = languageName(opts.to);

  const system =
    `You are a professional translator localizing a company website from ${from} into ${to}. ` +
    `Translate every item faithfully and idiomatically, in the register a native marketing writer would use. ` +
    `Keep markdown, HTML tags, line breaks, placeholders like {name} or {{count}}, URLs, email addresses and numbers exactly as they are. ` +
    `Never translate these names: ${KEEP_AS_IS.join(', ')}. ` +
    `Keep each translation close to the original length so layouts still fit. ` +
    `Return EVERY item exactly once with its original number, and nothing else — no notes, no added items.` +
    (opts.context ? `\n\nContext from the site owner:\n${opts.context}` : '');

  const result = await callAiCompletion({
    supabase,
    source: opts.source ?? 'translate',
    provider: ai.provider,
    model: ai.model,
    apiUrl: ai.apiUrl,
    apiKey: ai.apiKey,
    metadata: { to: opts.to, from: opts.from ?? 'auto', items: items.length },
    body: {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ items }) },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'deliver_translations',
          description: `The translated items, same numbers, one entry per input item.`,
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    i: { type: 'number', description: 'The input item number, unchanged' },
                    text: { type: 'string', description: `The translation in ${to}` },
                  },
                  required: ['i', 'text'],
                },
              },
            },
            required: ['items'],
          },
        },
      }],
      tool_choice: { type: 'function', function: { name: 'deliver_translations' } },
      temperature: 0.2,
    },
  });

  const call = result?.choices?.[0]?.message?.tool_calls?.[0];
  let parsed: any = null;
  try {
    parsed = JSON.parse(call?.function?.arguments ?? 'null');
  } catch {
    parsed = null;
  }
  const delivered: any[] = Array.isArray(parsed?.items) ? parsed.items : [];
  const wanted = new Map(items.map((it) => [it.i, it.text]));
  for (const d of delivered) {
    const i = Number(d?.i);
    if (!wanted.has(i) || typeof d?.text !== 'string') continue;
    const text = d.text;
    if (!text.trim()) continue;
    out.set(i, text);
  }
  return out;
}

/**
 * Translate many strings in bounded batches. A batch that comes back short is
 * retried once; what is still missing after that is left untouched and
 * counted, so the caller can say "3 of 212 strings still in English".
 */
export async function translateAll(
  supabase: any,
  items: NumberedString[],
  opts: TranslateOptions,
  batches: NumberedString[][],
): Promise<{ translations: Map<number, string>; untranslated: number[]; batches: number }> {
  const translations = new Map<number, string>();
  const untranslated: number[] = [];
  for (const batch of batches) {
    let got = await translateBatch(supabase, batch, opts);
    const missing = batch.filter((it) => !got.has(it.i));
    if (missing.length) {
      const retry = await translateBatch(supabase, missing, opts);
      got = new Map([...got, ...retry]);
    }
    for (const it of batch) {
      const t = got.get(it.i);
      if (t) translations.set(it.i, t);
      else untranslated.push(it.i);
    }
  }
  void items;
  return { translations, untranslated, batches: batches.length };
}
