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
  input_schema: any;
}

export interface SkillCatalog {
  count: number;
  skills: SkillCatalogEntry[];
}

export const DISPATCH_SEARCH_DEFAULT_LIMIT = 20;
export const DISPATCH_SEARCH_MAX_LIMIT = 40;

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
): SkillCatalog {
  const cap = Math.min(Math.max(1, limit), DISPATCH_SEARCH_MAX_LIMIT);
  let ranked = (defs || []).filter((d) => d?.function?.name);
  if (query && query.trim()) {
    ranked = scoreSkillsByIntent(ranked, query, { maxSkills: cap, usageBoost });
  }
  const skills = ranked.slice(0, cap).map((d: any) => ({
    name: d.function.name,
    description: d.function.description ?? '',
    input_schema: d.function.parameters || { type: 'object', properties: {} },
  }));
  return { count: skills.length, skills };
}
