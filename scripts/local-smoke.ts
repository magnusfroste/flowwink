/* eslint-disable @typescript-eslint/no-explicit-any -- dev smoke harness over dynamic responses */
import { Client } from 'pg';

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const FN = 'http://127.0.0.1:54321/functions/v1/agent-execute';

const c = new Client({ connectionString: LOCAL });
await c.connect();
const skills = (await c.query(`select name, handler from agent_skills where enabled and mcp_exposed order by name`)).rows as Array<{ name: string; handler: string }>;
await c.end();

// Patterns that mean "the skill ran and validated input" — NOT a bug. Includes
// "without parameters in the schema cache" — that's PostgREST resolving an
// action RPC called with empty args (no zero-arg overload), i.e. expected here.
const EXPECTED = /required|must be|must contain|is required|provide|only admins|admin|not found|no .* found|invalid|cannot be empty|missing|expected|specify|at least|unauthorized|permission|forbidden|already exists|not enabled for this instance|no active|without parameters in the schema cache|not configured|not connected|no user_id|insufficient privileges|violates (not-null|foreign key|check) constraint/i;
// Patterns that mean a real handler/dispatch bug.
const BUG = /unknown db table|generic crud is not enabled|could not find the (table|relation)|unknown handler|unknown skill|unknown module|unknown .* skill|does not exist in the schema|p__|undefined is not|cannot read prop|TypeError|ReferenceError|relation .* does not exist|column .* does not exist/i;

const bugs: Array<{ name: string; handler: string; error: string }> = [];
const errors: Array<{ name: string; handler: string; error: string }> = [];
let ok = 0, validation = 0;

for (const s of skills) {
  try {
    const r = await fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_name: s.name, arguments: {}, agent_type: 'mcp' }),
      signal: AbortSignal.timeout(30000),
    });
    const j: any = await r.json().catch(() => ({}));
    const inner = j?.result ?? j;
    const err: string = inner?.error ?? inner?.result?.error ?? (j?.error) ?? '';
    if (!err && (inner?.status === 'success' || r.ok)) { ok++; continue; }
    if (BUG.test(err)) { bugs.push({ name: s.name, handler: s.handler, error: err.slice(0, 120) }); }
    else if (EXPECTED.test(err)) { validation++; }
    else { errors.push({ name: s.name, handler: s.handler, error: String(err).slice(0, 120) }); }
  } catch (e) {
    bugs.push({ name: s.name, handler: s.handler, error: 'EXCEPTION: ' + (e as Error).message.slice(0, 80) });
  }
}

console.log(`\n# Smoke-tested ${skills.length} skills via local agent-execute (empty args)\n`);
console.log(`  ✅ success: ${ok}   |   🟡 validation-rejected (expected): ${validation}   |   ❌ BUGS: ${bugs.length}   |   ❓ other errors: ${errors.length}\n`);
console.log('## ❌ HANDLER/DISPATCH BUGS');
if (bugs.length === 0) console.log('  (none)');
for (const b of bugs.sort((a, b) => a.handler.localeCompare(b.handler))) console.log(`  ${b.name} [${b.handler}]\n     ${b.error}`);
console.log('\n## ❓ OTHER non-classified errors (review — may be bugs or niche validation)');
for (const e of errors.slice(0, 40)) console.log(`  ${e.name} [${e.handler}]: ${e.error}`);
if (errors.length > 40) console.log(`  … +${errors.length - 40} more`);
