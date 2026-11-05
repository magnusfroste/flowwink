import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Names among `names` the platform has QUARANTINED — disabled with
 * `quarantined_at` set (self-healing, FlowPilot's skill_disable; see
 * supabase/functions/_shared/skills/skill-visibility.ts). A browser-side seed
 * (bootstrapModule, bootstrapPlatform) refreshes their definitions but never
 * switches them back on: that would undo the quarantine on the next admin
 * page load. Fails forward: an instance without the column (migration
 * 20261105100000 not yet applied) has nothing quarantined.
 */
export async function loadQuarantinedSkillNames(names: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    for (let i = 0; i < names.length; i += 100) {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('name')
        .in('name', names.slice(i, i + 100))
        .eq('enabled', false)
        .not('quarantined_at', 'is', null);
      if (error) {
        logger.warn('[skill-quarantine] quarantine unreadable, treating none as quarantined:', error.message);
        return new Set();
      }
      for (const r of data ?? []) out.add(r.name);
    }
  } catch (err) {
    logger.warn('[skill-quarantine] quarantine unreadable, treating none as quarantined:', err);
    return new Set();
  }
  return out;
}
