/**
 * dispatch.ts — the shared "2-tool surface" catalog builder.
 *
 * The Skill Relevance Engine (intent-scorer.ts) ranks skills by intent. This
 * module shapes that ranking into the on-demand catalog returned by the
 * `search_skills` tool — the discovery half of the search_skills → execute_skill
 * dispatch loop.
 *
 * Two consumers, ONE implementation (CLAUDE.md "shared primitive" rule):
 *   1. The outward MCP gateway  (mcp-server `search_skills`, ?mode=dispatch)
 *   2. FlowPilot's reason() loop (in-process `search_skills` built-in)
 *
 * It returns FULL tool contracts (name + description + input_schema) — never the
 * compacted/truncated schema the pre-narrow path injects into the model's tool
 * array — so the model always sees a skill's real required-args and usage notes
 * before calling it. That is exactly why external agents (OpenClaw/Hermes) call
 * skills correctly where the pre-narrow path drops the contract.
 */
import { scoreSkillsByIntent } from './intent-scorer.ts';

export interface SkillCatalogEntry {
  name: string;
  description: string;
  input_schema?: any;
  /** Set on an entry without its contract: how to get it. */
  contract?: string;
}

export interface SkillCatalog {
  count: number;
  skills: SkillCatalogEntry[];
  note?: string;
}

export const DISPATCH_SEARCH_DEFAULT_LIMIT = 20;
export const DISPATCH_SEARCH_MAX_LIMIT = 40;

/**
 * FlowPilot's own search (2026-11-23). Each search_skills answered 20 full
 * contracts — on www's heartbeat ~28 000 tokens a search, three searches in a
 * row, carried on every later step: the run spent its budget looking. The
 * best few keep their contract; the rest are named with the first sentence of
 * what they do, and searching by a name returns its contract. The outward
 * gateway keeps full contracts for every hit (an external agent pays its own
 * tokens and was built against that answer).
 */
export const PILOT_SEARCH_LIMIT = 10;
export const PILOT_FULL_CONTRACTS = 3;
const SHORT_DESCRIPTION = 220;

function firstSentence(text: string): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  const cut = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  return cut.length > SHORT_DESCRIPTION ? `${cut.slice(0, SHORT_DESCRIPTION - 1).trimEnd()}…` : cut;
}

/**
 * Rank a set of OpenAI-style tool definitions by `query` and shape the top
 * matches into a compact, FULL-contract catalog.
 *
 * @param defs       tool_definition objects ({ function: { name, description, parameters } })
 * @param query      natural-language intent; empty → keep input order
 * @param usageBoost recent per-skill usage counts (from loadRecentUsageCounts)
 * @param limit      max results (clamped to DISPATCH_SEARCH_MAX_LIMIT)
 */
export function buildSkillCatalog(
  defs: any[],
  query: string,
  usageBoost: Record<string, number> = {},
  limit: number = DISPATCH_SEARCH_DEFAULT_LIMIT,
  opts: { fullContracts?: number } = {},
): SkillCatalog {
  const cap = Math.min(Math.max(1, limit), DISPATCH_SEARCH_MAX_LIMIT);
  let ranked = (defs || []).filter((d) => d?.function?.name);
  if (query && query.trim()) {
    ranked = scoreSkillsByIntent(ranked, query, { maxSkills: cap, usageBoost });
  }
  const full = opts.fullContracts ?? cap;
  // A search for one skill by its exact name always answers its contract.
  const exact = (query || '').trim();
  const skills: SkillCatalogEntry[] = ranked.slice(0, cap).map((d: any, i: number) => (
    i < full || d.function.name === exact
      ? {
        name: d.function.name,
        description: d.function.description ?? '',
        input_schema: d.function.parameters || { type: 'object', properties: {} },
      }
      : {
        name: d.function.name,
        description: firstSentence(d.function.description ?? ''),
        contract: 'search_skills with this exact name returns its parameters',
      }
  ));
  const short = skills.filter((s) => s.contract).length;
  return short
    ? { count: skills.length, skills, note: `The first ${skills.length - short} carry their parameters; for another, search_skills with its exact name.` }
    : { count: skills.length, skills };
}
