/**
 * The module defaults, read out of `defaultModulesSettings` in
 * src/hooks/useModules.tsx — for the generator that bundles them into the edge.
 *
 * Why read the SOURCE: useModules.tsx imports the browser Supabase client, so
 * it cannot be loaded under Bun (scripts/skills-to-json.ts). The object stays
 * the one source of truth; this only reads it. The guardrail
 * module-defaults-reach-headless-instances.guardrails.test.ts imports the real
 * object in vitest and compares it with this reading, key by key — a module
 * this parser misses, or an `enabled:` it cannot read as a literal, turns CI
 * red instead of shipping a wrong default to the server.
 *
 * Shape it reads (two-space module keys, four-space fields):
 *   export const defaultModulesSettings: ModulesSettings = {
 *     analytics: {
 *       enabled: true,
 *       core: true,
 *       …
 *     },
 *   };
 */
export interface SourceModuleDefault {
  /** `enabled:` as written; null when it is not a `true`/`false` literal. */
  enabled: boolean | null;
  core: boolean;
}

export function readModuleDefaultsFromSource(src: string): Record<string, SourceModuleDefault> {
  const start = src.indexOf('export const defaultModulesSettings');
  if (start < 0) throw new Error('useModules.tsx: `export const defaultModulesSettings` not found');
  const body = src.slice(start);
  const end = body.search(/\n\};/);
  const block = end < 0 ? body : body.slice(0, end);

  const out: Record<string, SourceModuleDefault> = {};
  let current: string | null = null;
  for (const line of block.split('\n')) {
    const head = line.match(/^ {2}([A-Za-z0-9_]+): \{\s*$/);
    if (head) { current = head[1]; out[current] = { enabled: null, core: false }; continue; }
    if (/^ {2}\}/.test(line)) { current = null; continue; }
    if (!current) continue;
    const enabled = line.match(/^ {4}enabled: (true|false),?\s*(\/\/.*)?$/);
    if (enabled) out[current].enabled = enabled[1] === 'true';
    else if (/^ {4}core: true,?\s*(\/\/.*)?$/.test(line)) out[current].core = true;
  }
  return out;
}
