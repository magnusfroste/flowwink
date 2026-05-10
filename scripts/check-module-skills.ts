import { getAllUnifiedModules, getUnifiedSkillNames } from '../src/lib/module-def';
import '../src/lib/modules';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const sb = createClient(url, key);

const { data } = await sb.from('agent_skills').select('name').eq('enabled', true);
const live = new Set((data ?? []).map((r: any) => r.name));

const mods = getAllUnifiedModules();
let totalMissing = 0;
for (const m of mods) {
  const skills = getUnifiedSkillNames(m.id);
  if (!skills.length) continue;
  const missing = skills.filter(s => !live.has(s));
  if (missing.length) {
    console.log(`❌ ${m.id}: missing [${missing.join(', ')}]`);
    totalMissing += missing.length;
  }
}
console.log(`\nTotal missing seeds: ${totalMissing}`);
