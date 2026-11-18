import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  GATEWAY_MISS_CODES,
  GATEWAY_MISS_HTTP,
  GATEWAY_RUN_STEP,
  MISS_NAME_MAX,
  gatewayMissAnswer,
  gatewayMissRow,
  nameNearness,
  nearestSkillNames,
  refusedCallInput,
  unknownReason,
  type GatewayMiss,
} from '../../../supabase/functions/_shared/mcp/gateway-misses';
import { classifyAgentError } from '../../../supabase/functions/_shared/agent-errors';
import { NOT_A_SKILL_FAULT, selfHealCandidates } from '../../../supabase/functions/_shared/skills/skill-visibility';
import { machineRoomReports } from '../../../supabase/functions/_shared/feedback/machine-room-reports';

/**
 * Guardrail: every "no" the gateway says is answered with a code and written down.
 *
 * 2026-11-18, after two weeks of Peter's Hermes and Svante's Claude on optic and
 * Hermes on www: `execute_skill` with a name that does not exist answered one
 * sentence and left no row — nor did a tool the connection does not carry, a
 * call outside the key's scope or the owner's reach, or a write on a read-only
 * key. Only an unknown `read_skill` was journaled, without a code, so the
 * machine room read its message and filed "Skill failing: read_skill" on the
 * fleet's board. Nobody could see what agents look for and do not find.
 */

const GATEWAY = readFileSync('supabase/functions/mcp-server/index.ts', 'utf8');

/** The source without its comments: what the gateway can actually answer. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');
}

const SKILLS = [
  'manage_document', 'list_contract_documents', 'manage_project_task', 'manage_project',
  'comment_on_task', 'manage_invoice', 'manage_wiki_page', 'search_wiki', 'browse_blog',
  'write_blog_post', 'manage_blog_posts', 'manage_leads', 'add_lead',
];

const unknown = (over: Partial<Extract<GatewayMiss, { kind: 'unknown_skill' }>> = {}): GatewayMiss => ({
  kind: 'unknown_skill', name: 'manage_docs', calledAs: 'execute_skill', dispatch: true, ...over,
});

const EVERY_MISS: GatewayMiss[] = [
  unknown(),
  unknown({ calledAs: 'read_skill' }),
  unknown({ calledAs: 'tool', dispatch: false }),
  unknown({ name: 'manage_ticket', ownerModule: 'tickets', moduleOff: true }),
  unknown({ name: 'manage_invoice', ownerModule: 'invoicing' }),
  unknown({ name: 'manage_document', calledAs: 'tool', isSkillHere: true, ownerModule: 'documents' }),
  { kind: 'forbidden', skill: 'manage_invoice', reason: 'the person this agent acts for has no access to the invoicing module' },
  { kind: 'forbidden', skill: 'manage_invoice', reason: 'no access', calledAs: 'read_skill' },
  { kind: 'out_of_scope', skill: 'manage_invoice' },
  { kind: 'read_only_key', skill: 'manage_invoice' },
];

describe('a miss is the caller\'s, never a broken skill', () => {
  it('every miss answers the envelope: error, code, retryable, hint', () => {
    for (const m of EVERY_MISS) {
      const a = gatewayMissAnswer(m);
      expect(a.error.length, JSON.stringify(m)).toBeGreaterThan(10);
      expect(a.code).toBe(GATEWAY_MISS_CODES[m.kind]);
      expect(typeof a.retryable).toBe('boolean');
      expect(a.hint.length).toBeGreaterThan(20);
      expect([403, 404]).toContain(GATEWAY_MISS_HTTP[m.kind]);
    }
  });

  it('every code a miss stores is one self-healing and the machine room skip', () => {
    for (const c of Object.values(GATEWAY_MISS_CODES)) expect(NOT_A_SKILL_FAULT.has(c), c).toBe(true);
    for (const m of EVERY_MISS) expect(gatewayMissRow(m).output.code).toBe(GATEWAY_MISS_CODES[m.kind]);
  });

  it('the message alone would be called a handler error — which is why the code is stored', () => {
    // What put "Skill failing: read_skill" on the fleet's board.
    expect(classifyAgentError('Unknown skill: manage_docs').code).toBe('HANDLER_ERROR');
    expect(classifyAgentError("API key scope does not permit skill 'manage_invoice'.").code).toBe('HANDLER_ERROR');
  });

  it('ten made-up names in a day report nothing upstream and quarantine nothing', () => {
    const rows = Array.from({ length: 10 }, (_, i) => gatewayMissRow(unknown({ name: `made_up_${i}` })));
    const failures = rows.map((r) => ({ skill_name: r.skill_name, error_message: r.error_message, code: String(r.output.code) }));
    expect(machineRoomReports({ jobs: [], pulse: { starving: false }, failures })).toEqual([]);
    expect(selfHealCandidates(rows.map((r) => ({ skill_name: r.skill_name, status: r.status, code: String(r.output.code) })), 3)).toEqual([]);
    // The same rows as they were written before: no code, read by the message.
    const before = failures.map((f) => ({ ...f, code: null }));
    expect(machineRoomReports({ jobs: [], pulse: { starving: false }, failures: before }).map((r) => r.title)).toEqual([`Skill failing: ${GATEWAY_RUN_STEP}`]);
  });
});

describe('the row says what was asked for', () => {
  it('a name that is no skill is filed under the step, the name in input — skill_name stays a closed vocabulary', () => {
    const run = gatewayMissRow(unknown());
    expect(run).toMatchObject({ skill_name: 'execute_skill', status: 'failed', error_message: 'Unknown skill: manage_docs', input: { name: 'manage_docs' }, ownedSkill: null });
    expect(gatewayMissRow(unknown({ calledAs: 'read_skill' })).skill_name).toBe('read_skill');
    const tool = gatewayMissRow(unknown({ calledAs: 'tool', dispatch: false }));
    expect(tool).toMatchObject({ skill_name: 'execute_skill', error_message: 'Unknown tool: manage_docs', input: { name: 'manage_docs', called_as: 'tool' } });
  });

  it('why it is not there: no such skill, a module that is off, a connection that does not carry it, the wrong door', () => {
    expect(unknownReason(unknown() as never)).toBe('no_such_skill');
    expect(gatewayMissRow(unknown({ name: 'manage_ticket', ownerModule: 'tickets', moduleOff: true })).output).toMatchObject({ reason: 'module_off', module: 'tickets' });
    expect(gatewayMissRow(unknown({ name: 'manage_invoice', ownerModule: 'invoicing' })).output.reason).toBe('not_on_this_connection');
    expect(gatewayMissRow(unknown({ name: 'manage_document', calledAs: 'tool', isSkillHere: true })).output.reason).toBe('skill_called_as_tool');
  });

  it('a refusal of a real skill is filed under that skill, with the names of what was sent and none of the values', () => {
    const row = gatewayMissRow({ kind: 'read_only_key', skill: 'write_blog_post' }, { title: 'A', content: 'x'.repeat(9000), action: 'create', _internal: 1 });
    expect(row).toMatchObject({ skill_name: 'write_blog_post', status: 'failed', ownedSkill: 'write_blog_post', output: { code: 'READ_ONLY_KEY', reason: 'read_only_key' } });
    expect(row.input).toEqual({ action: 'create', _argument_names: ['action', 'content', 'title'] });
    expect(JSON.stringify(row).length).toBeLessThan(600);
    expect(refusedCallInput(null)).toEqual({});
    expect(refusedCallInput('x')).toEqual({});
    // A playbook that is out of reach is still the discovery step's row.
    expect(gatewayMissRow({ kind: 'forbidden', skill: 'manage_invoice', reason: 'no access', calledAs: 'read_skill' }))
      .toMatchObject({ skill_name: 'read_skill', input: { name: 'manage_invoice' }, ownedSkill: null, output: { code: 'FORBIDDEN' } });
  });

  it('a name the caller made long is clipped before it is echoed or stored', () => {
    const long = 'x'.repeat(5000);
    const row = gatewayMissRow(unknown({ name: long }));
    expect(String(row.input.name).length).toBeLessThanOrEqual(MISS_NAME_MAX + 1);
    expect(row.error_message.length).toBeLessThan(MISS_NAME_MAX + 40);
    expect(gatewayMissAnswer(unknown({ name: long })).error.length).toBeLessThan(MISS_NAME_MAX + 120);
  });
});

describe('the answer says the next call', () => {
  it('a name that is nearly right gets the right one', () => {
    expect(nearestSkillNames('manage_documents', SKILLS)[0]).toBe('manage_document');
    expect(nearestSkillNames('Manage-Document', SKILLS)).toContain('manage_document');
    expect(nearestSkillNames('list_tasks', SKILLS)).toContain('manage_project_task');
    expect(nearestSkillNames('search_documents', SKILLS)).toContain('manage_document');
    expect(nearestSkillNames('manage_blog_post', SKILLS)[0]).toBe('manage_blog_posts');
  });

  it('a shared verb is not nearness, and a guess is not a suggestion', () => {
    expect(nameNearness('manage_payroll', 'manage_invoice')).toBe(0);
    expect(nearestSkillNames('manage_payroll', SKILLS)).toEqual([]);
    expect(nearestSkillNames('frobnicate_the_widget', SKILLS)).toEqual([]);
    expect(nearestSkillNames('', SKILLS)).toEqual([]);
    expect(nearestSkillNames('manage_documents', SKILLS).length).toBeLessThanOrEqual(5);
  });

  it('near names ride on the answer; with none the agent is sent to search_skills', () => {
    const near = gatewayMissAnswer(unknown({ name: 'manage_documents', didYouMean: ['manage_document'] }));
    expect(near).toMatchObject({ code: 'NOT_FOUND', retryable: true, did_you_mean: ['manage_document'] });
    expect(near.error).toBe('Unknown skill: manage_documents — did you mean manage_document?');
    const none = gatewayMissAnswer(unknown());
    expect(none.error).toMatch(/^Unknown skill: manage_docs\. Use search_skills/);
    expect(none).not.toHaveProperty('did_you_mean');
    expect(none.hint).toMatch(/search_skills/);
    // A connection that carries every skill as its own tool has no search_skills to be sent to.
    const plain = gatewayMissAnswer(unknown({ calledAs: 'tool', dispatch: false }));
    expect(plain.error).toBe('Unknown tool: manage_docs. The names this connection carries are in tools/list.');
    expect(plain.hint).toMatch(/tools\/list .*\?mode=dispatch/);
  });

  it('a module that is off is not retried, and says who switches it on', () => {
    const a = gatewayMissAnswer(unknown({ name: 'manage_ticket', ownerModule: 'tickets', moduleOff: true }));
    expect(a.retryable).toBe(false);
    expect(a.error).toMatch(/tickets module, which is switched off/);
    expect(a.hint).toMatch(/admin/);
  });

  it('a skill called as a tool on a dispatch connection is shown execute_skill', () => {
    const a = gatewayMissAnswer(unknown({ name: 'manage_document', calledAs: 'tool', isSkillHere: true }));
    expect(a.error).toMatch(/^Unknown tool: manage_document\. This connection is in dispatch mode/);
    expect(a.hint).toContain('execute_skill with { "name": "manage_document"');
    expect(a.retryable).toBe(true);
  });

  it('the texts agents and sweeps already read are still there', () => {
    expect(gatewayMissAnswer({ kind: 'forbidden', skill: 's', reason: 'no access to the crm module' }).error).toBe('Forbidden: no access to the crm module');
    expect(gatewayMissAnswer({ kind: 'out_of_scope', skill: 'manage_invoice' }).error).toBe("API key scope does not permit skill 'manage_invoice'.");
    expect(gatewayMissAnswer({ kind: 'read_only_key', skill: 'manage_invoice' }).error).toMatch(/^This API key is read-only: 'manage_invoice' writes/);
  });
});

describe('the gateway has one way to say no', () => {
  const src = code(GATEWAY);

  it('no refusal text is written in the gateway itself — every one comes from gateway-misses.ts', () => {
    // Discover, do not enumerate: a new path that answers "Unknown skill" or
    // "Forbidden" by hand answers without a row, and fails here.
    for (const shape of [/Unknown skill/, /Unknown tool/, /Forbidden: /, /does not permit skill/, /API key is read-only/]) {
      expect(src.match(shape), String(shape)).toBeNull();
    }
  });

  it('refuse() writes the row, then answers — and nothing else builds a miss answer', () => {
    const fn = GATEWAY.slice(GATEWAY.indexOf('function refuse('), GATEWAY.indexOf('function refusedContent('));
    expect(fn.indexOf('writeGatewayRow({')).toBeGreaterThan(0);
    expect(fn.indexOf('writeGatewayRow({')).toBeLessThan(fn.indexOf('return gatewayMissAnswer(miss);'));
    expect(src.match(/gatewayMissAnswer\(/g)).toHaveLength(1);
    expect(src.match(/gatewayMissRow\(/g)).toHaveLength(1);
  });

  it('every verdict that stops a call goes through refuse()', () => {
    // Each `ownerMayRun` / scope verdict in a call path is followed by a refusal.
    const refusals = src.match(/\brefuse\(|restRefusal\(/g) ?? [];
    // native: read_skill, execute_skill ×3, per-skill tool ×2, unknown tool,
    // read-only key; REST: the helper itself, read_skill, execute_skill ×3, plain ×4.
    expect(refusals.length).toBeGreaterThanOrEqual(17);
    expect(src.match(/kind: "out_of_scope"/g)).toHaveLength(4);
    expect(src.match(/kind: "read_only_key"/g)).toHaveLength(1);
    expect(src.match(/await unknownSkill\(/g)).toHaveLength(6);
    // A verdict is never answered by hand any more.
    expect(src).not.toMatch(/if \(!\w+\.ok\) return (c\.json\(\{ error|\{ content)/);
  });

  it('the row is stamped as the executor stamps its own: the key column, the module, the kind', () => {
    const fn = GATEWAY.slice(GATEWAY.indexOf('function writeGatewayRow('), GATEWAY.indexOf('function logDiscovery('));
    expect(fn).toContain('...(caller?.callerApiKeyId ? { api_key_id: caller.callerApiKeyId } : {})');
    expect(fn).toContain('...(owner && owner !== "platform" ? { module: owner } : {})');
    expect(fn).toContain('insert({ ...base, kind: row.kind })');
    // An instance whose migration lags keeps the row without the column.
    expect(fn).toMatch(/PGRST204\|42703\|column/);
    // Never on the answer path.
    expect(fn).toMatch(/edge\?\.waitUntil\?\.\(write\)/);
    // A discovery step is a lookup: the nightly thinning may thin it.
    expect(GATEWAY).toContain('writeGatewayRow({ skill_name: step, input, output, status: "success", kind: "read" }, startedAt, caller);');
  });

  it('a tool the connection does not carry is answered by the gateway, not by the library\'s "Method not found"', () => {
    expect(GATEWAY).toContain('server.onError(async (error: unknown, ctx:');
    const fn = GATEWAY.slice(GATEWAY.indexOf('server.onError('), GATEWAY.indexOf('// …and the key\'s scope:'));
    expect(fn).toContain('ctx?.request?.method !== "tools/call"');
    expect(fn).toContain('await unknownSkill(called.name, "tool", reachable, dispatchMode)');
    expect(fn).toContain('return { code: JSONRPC_METHOD_NOT_FOUND, message: answer.error, data: answer };');
  });

  it('the dispatch tool holds a call to the key\'s scope, as the per-skill tools and REST do', () => {
    // Until 2026-11-18 native execute_skill checked the owner's reach only: a
    // key scoped to mcp:crm could run any exposed skill in dispatch mode.
    const fn = GATEWAY.slice(GATEWAY.indexOf('server.tool("execute_skill"'), GATEWAY.indexOf('/** JSON-RPC "Method not found"'));
    const scope = fn.indexOf('!scopeAllowsSkill(ctx?.scopes, match.name, match.category)');
    expect(scope).toBeGreaterThan(0);
    expect(fn).toContain('!skillWithinGroups(match.name, match.handler, match.category, ctx?.peerGroups)');
    expect(scope).toBeLessThan(fn.indexOf('await executeSkill(match.name, skillArgs'));
  });

  it('the briefing\'s "recent activity" is what was done: a run that never started is not in it', () => {
    expect(GATEWAY).toContain('.not("skill_name", "in", `(${[...DISCOVERY_STEPS, GATEWAY_RUN_STEP].join(",")})`)');
    expect(GATEWAY_RUN_STEP).toBe('execute_skill');
  });
});
