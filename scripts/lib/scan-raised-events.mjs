/**
 * Every platform event the code raises — found, not listed.
 *
 * An event is raised by `emit_platform_event('<name>', …)` in SQL (a literal
 * name, or `'<entity>.' || NEW.status` over a list the same statement names)
 * or by an edge function inserting it into agent_events. A feature that OFFERS
 * an event — a survey trigger, an automation — must offer one of these, or it
 * waits for something that never comes (2026-11-22: five of six survey
 * triggers were never raised).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, ext, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (/node_modules|__tests__/.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

/** @returns {Set<string>} */
export function scanRaisedEvents(root = process.cwd()) {
  const raised = new Set();
  const files = [...walk(join(root, 'supabase/migrations'), ['.sql']), ...walk(join(root, 'supabase/functions'), ['.ts'])];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/emit_platform_event\(\s*(?:p_event_name\s*=>\s*)?'([a-z_]+\.[a-z_.]+)'/g)) raised.add(m[1]);
    // 'order.' || NEW.status  … NEW.status IN ('cancelled', 'refunded')
    for (const m of s.matchAll(/emit_platform_event\(\s*'([a-z_]+)\.'\s*\|\|\s*NEW\.(\w+)/g)) {
      const before = s.slice(Math.max(0, m.index - 400), m.index);
      const list = [...before.matchAll(new RegExp(`NEW\\.${m[2]}\\s+IN\\s*\\(([^)]*)\\)`, 'g'))].pop();
      if (list) for (const v of list[1].matchAll(/'([a-z_]+)'/g)) raised.add(`${m[1]}.${v[1]}`);
    }
    if (f.endsWith('.ts')) {
      for (const m of s.matchAll(/(?:event_name|eventName)\s*:\s*['"]([a-z_]+\.[a-z_.]+)['"]/g)) raised.add(m[1]);
    }
  }
  return raised;
}
