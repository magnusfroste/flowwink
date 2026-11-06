/**
 * One description reaches every surface, and it carries the markers
 * (2026-11-06). search_skills ranked by the row description ("Use when: /
 * NOT for:", rankableDef) while native tools/list, /rest/tools and
 * FlowPilot's pre-narrow sent tool_definition.function.description — which
 * lacked the markers in 555 of 657 exposed skills. Now all three send the
 * rankable description, and a ratchet keeps it marked and bounded: the
 * baseline names may only leave the lists (Law 2 — a skill is picked by its
 * metadata, so the metadata is the contract).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { skillModuleToken, classifySkillModule } from '../../../supabase/functions/_shared/mcp/groups';

const read = (p: string) => readFileSync(p, 'utf8');
const artifact = JSON.parse(read('supabase/functions/agent-execute/_module-skills.json')) as {
  modules: Array<{ moduleId: string; skills: Array<{ name: string; description?: string; mcp_exposed?: boolean; tool_definition?: { function?: { description?: string } } }> }>;
};
const baseline = JSON.parse(read('src/lib/__tests__/fixtures/skill-markers-baseline.json')) as { cap_chars: number; lacking_use_when: string[]; over_cap: string[] };

function rankable(s: { description?: string; tool_definition?: { function?: { description?: string } } }): string {
  return (s.description ?? '').trim() || (s.tool_definition?.function?.description ?? '');
}

describe('the one description', () => {
  it('native tools/list, /rest/tools and the pre-narrow send the rankable description', () => {
    const mcp = read('supabase/functions/mcp-server/index.ts');
    expect(mcp).toMatch(/description: `\[\$\{skill\.category\}\] \$\{rankableDef\(skill\)\?\.function\?\.description \|\|/);
    expect(mcp).toMatch(/description: rankableDef\(s\)\?\.function\?\.description \|\| s\.tool_definition\.function\.description/);
    expect(read('supabase/functions/_shared/pilot/reason.ts')).toMatch(/const td = rankableDef\(s\) \?\? s\.tool_definition;/);
  });

  it('ratchet: every exposed skill carries "Use when:" and fits the cap — the baseline may only shrink', () => {
    const lacking: string[] = []; const over: string[] = [];
    for (const m of artifact.modules) {
      for (const s of m.skills) {
        if (s.mcp_exposed === false) continue;
        const d = rankable(s);
        if (!/use when/i.test(d)) lacking.push(s.name);
        if (d.length > baseline.cap_chars) over.push(s.name);
      }
    }
    const newLacking = lacking.filter((n) => !baseline.lacking_use_when.includes(n));
    const newOver = over.filter((n) => !baseline.over_cap.includes(n));
    expect(newLacking, 'skills without "Use when:" that the baseline does not carry — add the marker').toEqual([]);
    expect(newOver, `skills whose description exceeds ${baseline.cap_chars} chars — move the manual into instructions`).toEqual([]);
    const gone = baseline.lacking_use_when.filter((n) => !lacking.includes(n)).concat(baseline.over_cap.filter((n) => !over.includes(n)));
    expect(gone, 'baseline names that no longer apply — remove them from the fixture to keep the gain').toEqual([]);
  });
});

describe('?groups=<module>', () => {
  it('narrows through the owner map, with the name heuristic only as a fallback', () => {
    expect(skillModuleToken('manage_webinar', 'module:webinars')).toBe('webinars');
    expect(skillModuleToken('add_lead', 'module:crm')).toBe('leads');
    expect(skillModuleToken('an_agent_made_this', null)).toBe(classifySkillModule('an_agent_made_this', null));
    const mcp = read('supabase/functions/mcp-server/index.ts');
    expect(mcp).toMatch(/const mod = skillModuleToken\(s\.name, s\.handler\);/);
    expect(mcp).toMatch(/const mod = skillModuleToken\(name, handler \?\? null\);/);
    expect(mcp).toMatch(/if \(owner !== "platform" && !\(key in MODULE_TO_CATEGORY\)\) MODULE_TO_CATEGORY\[key\] = "\*";/);
  });
});
