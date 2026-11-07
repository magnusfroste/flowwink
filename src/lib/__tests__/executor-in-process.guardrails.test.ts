import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the executor is a function you import, not only a URL you fetch
 * (2026-11-07).
 *
 * agent-execute's request pipeline — every gate in order, the handler
 * dispatch, the envelope, the journal — is `executeSkillRequest` in
 * _shared/execute/core.ts, and the HTTP function is a thin wrapper around it.
 * FlowPilot's ReAct loop and the MCP gateway call it in-process: one edge
 * invocation per tool call instead of two (a heartbeat with ten tool calls
 * was eleven invocations on a 500K/month budget), no second auth gate, the
 * JSON once. The same reasoning as "FlowPilot does NOT call its own MCP
 * gateway internally" — a transport is for crossing a trust boundary, and
 * both callers are already the service role inside the same Deno project.
 *
 * What this pins: the wrapper stays thin and keeps the wire's own concerns
 * (auth header, CORS, the async handoff); the core answers {status, body}
 * and never builds a Response; the two converted callers stay converted; the
 * gates keep their order in the core.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
/** The file's code lines: a comment may still say where the hop used to be. */
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('the executor runs in-process for callers inside the Deno project', () => {
  const core = read('supabase/functions/_shared/execute/core.ts');
  const fn = read('supabase/functions/agent-execute/index.ts');
  const reason = read('supabase/functions/_shared/pilot/reason.ts');
  const gateway = read('supabase/functions/mcp-server/index.ts');

  it('the core exports the pipeline as executeSkillRequest(body, auth) → { status, body }', () => {
    expect(core).toMatch(/export async function executeSkillRequest\(input: ExecuteRequest, auth: ExecuteAuth\): Promise<ExecuteOutcome>/);
    // The contract lives in types.ts (no imports), so the pilot can carry it without the core.
    const types = read('supabase/functions/_shared/execute/types.ts');
    expect(types).not.toMatch(/^import /m);
    expect(types).toMatch(/export const SERVICE_CALLER: ExecuteAuth = \{ isServiceCaller: true, gateUserId: null, gateIsAdmin: false \};/);
    expect(types).toMatch(/export interface ExecuteRequest \{/);
    expect(types).toMatch(/export interface ExecuteOutcome \{\s*status: number;\s*body: unknown;\s*\}/);
    expect(types).toMatch(/export type SkillRunner = \(body: ExecuteRequest, auth: ExecuteAuth\) => Promise<ExecuteOutcome>;/);
    expect(core).toContain("export type { ExecuteAuth, ExecuteOutcome, ExecuteRequest, SkillRunner } from './types.ts';");
  });

  it('the core never builds a Response, never serves, and never reaches for CORS', () => {
    expect(core).not.toMatch(/new Response\(/);
    expect(core).not.toMatch(/^serve\(/m);
    expect(core).not.toMatch(/corsHeaders/);
    // The lifecycle consolidation once left a serve() closer behind at column 0
    // and the function failed to boot; the core is a module, not a server.
    expect(core).not.toMatch(/^\}\);$/m);
  });

  it('the core takes the request through one JSON round trip, as the wire did', () => {
    // A handler mutates `arguments` (the server-stamped _caller_* keys, the
    // stripped _approved); in-process that must never write into the caller's
    // own object, and undefined values vanish the way they did over HTTP.
    expect(core).toContain('const body: ExecuteRequest = JSON.parse(JSON.stringify(input));');
    expect(core).toContain("if (!isServiceCaller && !gateUserId) {\n    return { status: 401, body: { error: 'Unauthorized' } };");
  });

  it('the gates keep their order in the core', () => {
    const marks = [
      'const retired = skill_name ? retiredSkillResult(String(skill_name)) : null;',
      '// 1. Look up the skill',
      '// 1b. AUTHORIZATION (JWT callers)',
      '// 1c. THE MODULE GATE',
      '// 2. Validate scope',
      '// 3a. STAGING ENVELOPE',
      '// 3. Check trust level',
      '// 3b. CONSUME THE APPROVAL',
      '// 4. Route to handler',
      '// 4b. The agent envelope',
      '// 5. Log activity',
      '// 6. Auto-track objective progress',
    ];
    const at = marks.map((m) => core.indexOf(m));
    for (const [i, idx] of at.entries()) expect(idx, marks[i]).toBeGreaterThan(-1);
    for (let i = 1; i < at.length; i++) expect(at[i], `${marks[i]} after ${marks[i - 1]}`).toBeGreaterThan(at[i - 1]);
  });

  it('the HTTP function is a thin wrapper: auth header → core → Response, plus the async handoff', () => {
    expect(fn.split('\n').length).toBeLessThan(160);
    expect(fn).toContain("import { executeSkillRequest, type ExecuteRequest } from '../_shared/execute/core.ts';");
    expect(fn).toContain('const out = await executeSkillRequest(body, { isServiceCaller, gateUserId, gateIsAdmin });');
    expect(fn).toContain('return json(out.body, out.status);');
    // Authentication stays on the wire (the service key, or a verified JWT and has_role).
    expect(fn).toContain('if (bearer && serviceKey && bearer === serviceKey) {');
    expect(fn).toContain("supabase.rpc('has_role', { _user_id: gateUserId, _role: 'admin' })");
    expect(fn).toContain("return json({ error: 'Unauthorized' }, 401);");
    // The 202 handoff is HTTP-only (a dispatcher re-posts to this URL).
    expect(fn).toContain('if (body.async === true) {');
    expect(fn).toContain('fetch(`${supabaseUrl}/functions/v1/agent-execute`');
    // Nothing of the pipeline lives here any more.
    for (const m of ['// 1. Look up the skill', '// 3a. STAGING ENVELOPE', 'executeModuleAction(', 'executeDbAction(', "handler === 'internal:"]) {
      expect(fn, m).not.toContain(m);
    }
  });

  it('FlowPilot’s ReAct loop runs a skill through the runner its config carries, keeping the non-2xx envelope', () => {
    // The loop never imports the core: the app's tsc reaches reason.ts through
    // its tests, and the core is Deno's (the deno ratchet). It carries the
    // contract only, and the entrypoints hand it the executor.
    expect(reason).toContain("import { SERVICE_CALLER, type ExecuteRequest, type SkillRunner } from '../execute/types.ts';");
    expect(reason).not.toMatch(/execute\/core\.ts/);
    expect(reason).toContain('const out = await opts.runSkill(body, SERVICE_CALLER);');
    expect(reason).toContain('runSkill: config.runSkill');
    expect(reason).toContain('return out.body;');
    // The envelope of a 403/404/409 still reaches the model, never retried from here — on both roads.
    expect(reason).toMatch(/const failed = \(status: number, parsed: Record<string, unknown>\) => \(\{[\s\S]*?http_status: status,\s*retryable: false,/);
    expect(reason).toMatch(/return failed\(out\.status, /);
    expect(reason).toMatch(/return failed\(response\.status, parsed\)/);
    const types = read('supabase/functions/_shared/types.ts');
    expect(types).toMatch(/runSkill\?: import\('\.\/execute\/types\.ts'\)\.SkillRunner;/);
  });

  it('every entrypoint that runs the loop hands it the executor', () => {
    const dir = join(process.cwd(), 'supabase/functions');
    const entrypoints = readdirSync(dir)
      .filter((d) => !d.startsWith('_') && existsSync(join(dir, d, 'index.ts')))
      .map((d) => [d, read(`supabase/functions/${d}/index.ts`)] as const)
      .filter(([, src]) => /\breason\(/.test(code(src)));
    expect(entrypoints.map(([d]) => d).sort()).toEqual(['agent-operate', 'flowpilot-heartbeat', 'workspace-chat']);
    for (const [d, src] of entrypoints) {
      expect(src, d).toMatch(/import \{ executeSkillRequest \} from ["']\.\.\/_shared\/execute\/core\.ts["'];/);
      const calls = code(src).match(/\breason\([\s\S]*?\{\s*scope: 'internal',\n\s*runSkill: executeSkillRequest,/g) ?? [];
      const total = code(src).match(/\breason\(/g) ?? [];
      expect(calls.length, `${d}: every reason() call passes runSkill: executeSkillRequest right after scope`).toBe(total.length);
    }
  });

  it('the MCP gateway runs a skill in-process, after its own read-only verdict', () => {
    expect(gateway).toContain('import { executeSkillRequest, SERVICE_CALLER } from "../_shared/execute/core.ts";');
    expect(code(gateway)).not.toContain('/functions/v1/agent-execute');
    const fnStart = gateway.indexOf('async function executeSkill(');
    const readOnlyAt = gateway.indexOf('if (requestContext.getStore()?.readOnly) {', fnStart);
    const runAt = gateway.indexOf('const out = await executeSkillRequest({', fnStart);
    expect(readOnlyAt).toBeGreaterThan(fnStart);
    expect(runAt).toBeGreaterThan(readOnlyAt);
    expect(gateway).toContain('agent_type: "mcp",');
    expect(gateway).toContain('return JSON.stringify({ error: `Execution failed (${out.status}): ${body}` });');
  });

  it('the JSON bundles stay in agent-execute/ (the artifact script writes them there) and the core imports them from there', () => {
    const artifacts = read('scripts/generated-artifacts.ts');
    for (const f of ['_module-skills.json', '_locale-packs.json', '_ui-text-catalog.json']) {
      expect(artifacts).toContain(`supabase/functions/agent-execute/${f}`);
      expect(core).toContain(`from "../../agent-execute/${f}" with { type: "json" }`);
    }
    expect(core).toContain('from "../../agent-execute/_templates.json" with { type: "json" }');
  });

  it('the guards that read the executor as text read the core, not the wrapper', () => {
    // 165 guardrail tests anchored on the pipeline's text; a guard pointed at
    // the 97-line wrapper would pass on an empty file.
    const dir = join(process.cwd(), 'src/lib/__tests__');
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && f !== 'executor-in-process.guardrails.test.ts')
      // A read of the wrapper as the pipeline's text — a comment or a note naming
      // the old path is history, not a read.
      .filter((f) => /(?:read|readFileSync|join|resolve)\([^)\n]*agent-execute\/index\.ts/.test(readFileSync(join(dir, f), 'utf-8')));
    expect(offenders).toEqual([]);
  });
});
