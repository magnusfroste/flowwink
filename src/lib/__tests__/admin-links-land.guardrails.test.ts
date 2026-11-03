/**
 * An admin link lands where it says. Two ways it did not (2026-10-31):
 * - the address had no route: /admin/hr/employees/<id> and
 *   /admin/hr/contracts/<id> (Flowwork's citations), /admin/projects/<id>
 *   (the calendar), /admin/accounting/journal/<id>, /admin/invoices/<id>,
 *   /admin/developer/webhooks, /admin/settings/modules, and Activities'
 *   `/admin/${entity_type}s/<id>` for every type;
 * - the route existed but the page ignored the parameter: ?tab= on HR, Leads,
 *   Automations and Invoices; ?project= on Projects; ?assignee=, ?sla=,
 *   ?priority= and ?id= on Tickets; ?id= and ?contact= on Deals — every
 *   dashboard tile that promised a filtered view opened the unfiltered page.
 *
 * Discover, don't enumerate: every literal /admin|/account address in the app
 * and the edge functions against the router's paths, and every `?param=`
 * against the target page (or a component it imports) reading that param.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const app = readFileSync('src/App.tsx', 'utf8');

const routePaths = (() => {
  const all = [...app.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
  // Children of /account are declared relative.
  return [...all.filter((p) => p.startsWith('/')), ...all.filter((p) => !p.startsWith('/')).map((p) => `/account/${p}`)];
})();
const routes = routePaths.map((p) => ({
  path: p,
  re: new RegExp(`^${p.replace(/\/\*$/, '(/.*)?').replace(/:\w+\??/g, '[^/]+')}/?$`),
}));

const elementOf = new Map<string, string>();
for (const m of app.matchAll(/\{\s*path:\s*"([^"]+)",\s*element:\s*(?:withPageFallback\()?<(\w+)/g)) elementOf.set(m[1], m[2]);
const importOf = new Map<string, string>();
for (const m of app.matchAll(/const (\w+) = lazy\(\(\) => import\("([^"]+)"\)\)/g)) importOf.set(m[1], m[2]);
for (const m of app.matchAll(/import (\w+) from "([^"]+)"/g)) importOf.set(m[1], m[2]);

function resolveModule(spec: string, from: string): string | null {
  const base = spec.startsWith('@/') ? `src/${spec.slice(2)}` : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (existsSync(base + ext)) return base + ext;
  return null;
}

/** The page file and the app modules it imports — where a param can be read. */
function pageSources(component: string): string[] {
  const spec = importOf.get(component);
  const file = spec ? resolveModule(spec, 'src/App.tsx') : null;
  if (!file) return [];
  const src = readFileSync(file, 'utf8');
  const deps = [...src.matchAll(/from ['"]((?:@\/|\.)[^'"]+)['"]/g)]
    .map((m) => resolveModule(m[1], file))
    .filter((f): f is string => !!f && !f.includes('/integrations/') && !f.includes('/ui/'));
  // A barrel (index.ts) re-exports — follow it one level.
  const barrels = deps.filter((d) => /\/index\.tsx?$/.test(d)).flatMap((b) =>
    [...readFileSync(b, 'utf8').matchAll(/from ['"]((?:@\/|\.)[^'"]+)['"]/g)]
      .map((m) => resolveModule(m[1], b))
      .filter((f): f is string => !!f));
  return [src, ...[...deps, ...barrels].map((d) => readFileSync(d, 'utf8'))];
}

function readsParam(sources: string[], param: string): boolean {
  return sources.some((s) =>
    new RegExp(`['"]${param}['"]`).test(s)
    || (param === 'tab' && /useTabParam\(\s*['"][\w-]+['"]\s*\)/.test(s)));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!/^(node_modules|tests|__tests__)$/.test(f)) walk(p, out);
    } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

const files = [...walk('src'), ...walk('supabase/functions')];

describe('admin links land where they say', () => {
  it('the router is read', () => {
    expect(routes.length).toBeGreaterThan(150);
    expect(elementOf.get('/admin/hr')).toBe('HRPage');
  });

  it('every /admin and /account address has a route', () => {
    const wrong = new Map<string, string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(['"`])(\/(?:admin|account)(?:\/[^'"`\s?#)]*)?)(?:[?#][^'"`]*)?\1/g)) {
        const target = m[2].replace(/\$\{[^}]*\}/g, 'X').replace(/\/$/, '');
        if (target.includes('${') || routes.some((r) => r.re.test(target))) continue;
        if (!wrong.has(target)) wrong.set(target, `${f}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect([...wrong].map(([t, at]) => `${t}  ← ${at}`)).toEqual([]);
  });

  it('every ?param= deep link is read by the page it opens', () => {
    const wrong = new Map<string, string>();
    const cache = new Map<string, string[]>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/[`'"](\/admin\/[\w\-/]*)\?([a-z_]+)=/g)) {
        const path = m[1].replace(/\/$/, '');
        const component = elementOf.get(path);
        if (!component) continue; // a path the route test judges
        if (!cache.has(component)) cache.set(component, pageSources(component));
        const sources = cache.get(component)!;
        if (sources.length && !readsParam(sources, m[2])) {
          wrong.set(`${path}?${m[2]}`, `${f}:${src.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect([...wrong].map(([t, at]) => `${t}  ← ${at}`)).toEqual([]);
  });
});
