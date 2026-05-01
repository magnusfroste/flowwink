/**
 * useGatedSkills — transparent catalog of every agent skill that requires
 * approval or notify before it executes. Joins agent_skills with the unified
 * module registry so admins can see WHICH module owns each gated capability,
 * and counts pending/recent requests per skill.
 *
 * This is the read model for /admin/approvals → "Gated Skills" tab. It does
 * not change anything; it makes the existing trust_level field discoverable.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getAllUnifiedModules } from '@/lib/module-def';

export interface GatedSkill {
  name: string;
  description: string | null;
  category: string | null;
  trust_level: 'approve' | 'notify';
  mcp_exposed: boolean;
  enabled: boolean;
  /** Module id that declared this skill (or null if it's a core/orphan skill) */
  moduleId: string | null;
  moduleName: string | null;
  /** Pending approval requests where context.skill_name = this skill */
  pendingCount: number;
  /** Total requests in the last 30 days */
  recentCount: number;
  lastRequestedAt: string | null;
}

/** Build a skill_name → moduleId lookup from the unified registry */
function buildSkillOwnerMap(): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  for (const mod of getAllUnifiedModules()) {
    const owner = { id: mod.id as string, name: mod.name };
    for (const skillName of mod.skills ?? []) {
      map.set(skillName, owner);
    }
    for (const seed of mod.skillSeeds ?? []) {
      if (seed?.name) map.set(seed.name, owner);
    }
  }
  return map;
}

export function useGatedSkills() {
  return useQuery({
    queryKey: ['approvals', 'gated-skills'],
    queryFn: async (): Promise<GatedSkill[]> => {
      // 1. Pull every gated skill from the catalog
      const { data: skills, error: skillsError } = await supabase
        .from('agent_skills')
        .select('name, description, category, trust_level, mcp_exposed, enabled')
        .in('trust_level', ['approve', 'notify'])
        .order('trust_level', { ascending: false })
        .order('name', { ascending: true });
      if (skillsError) throw skillsError;
      if (!skills || skills.length === 0) return [];

      // 2. Pull recent requests so we can show usage per skill
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: requests, error: reqError } = await supabase
        .from('approval_requests')
        .select('status, context, created_at')
        .eq('entity_type', 'agent_skill')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false });
      if (reqError) throw reqError;

      // 3. Index requests by skill name
      const reqByName = new Map<string, { pending: number; recent: number; last: string | null }>();
      for (const r of requests ?? []) {
        const ctx = (r.context ?? {}) as Record<string, unknown>;
        const name = typeof ctx.skill_name === 'string' ? ctx.skill_name : null;
        if (!name) continue;
        const cur = reqByName.get(name) ?? { pending: 0, recent: 0, last: null };
        cur.recent += 1;
        if (r.status === 'pending') cur.pending += 1;
        if (!cur.last || r.created_at > cur.last) cur.last = r.created_at;
        reqByName.set(name, cur);
      }

      // 4. Resolve module ownership from the unified registry
      const ownerMap = buildSkillOwnerMap();

      return skills.map((s) => {
        const owner = ownerMap.get(s.name) ?? null;
        const stats = reqByName.get(s.name) ?? { pending: 0, recent: 0, last: null };
        return {
          name: s.name,
          description: s.description,
          category: s.category,
          trust_level: s.trust_level as 'approve' | 'notify',
          mcp_exposed: !!s.mcp_exposed,
          enabled: !!s.enabled,
          moduleId: owner?.id ?? null,
          moduleName: owner?.name ?? null,
          pendingCount: stats.pending,
          recentCount: stats.recent,
          lastRequestedAt: stats.last,
        };
      });
    },
  });
}
