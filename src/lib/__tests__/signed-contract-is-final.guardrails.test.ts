import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sign-to-serve, process battery 2026-09-19. A signed agreement could be
 * rewritten (body, value, appendices) through the ordinary update skills — "do
 * not edit after signing" was advice in a skill text, and nothing refused. A
 * signed agreement could be sent for signature again. And signing NEVER created
 * the service: a trigger refused provider "contract" for three weeks while
 * contract-sign logged the error and answered 200.
 *
 * The signature covers a fixed content (what contract-sign hashes). That
 * content is final from signed_at, for every writer — the rule is on the table.
 */

const root = join(__dirname, '../../..');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const contractSign = readFileSync(join(root, 'supabase/functions/contract-sign/index.ts'), 'utf8');

function latestFunctionBody(fnName: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1; let m: RegExpExecArray | null;
  while ((m = re.exec(migrations))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const ends = ['$function$;', '$fn$;', 'END $$;'].map((e) => migrations.indexOf(e, start)).filter((x) => x > -1);
  return migrations.slice(start, Math.min(...ends));
}

describe('what was signed is final', () => {
  it('every field the signature hashes is frozen on the contract', () => {
    // The hashed fields are read out of contract-sign, not listed here: if the
    // hash grows a field, the trigger must freeze it too.
    const hashBlock = contractSign.slice(contractSign.indexOf('const contentHash = await sha256Hex'), contractSign.indexOf('appendices: appendices.map'));
    const hashed = [...hashBlock.matchAll(/^\s+(\w+): contract\.(\w+)/gm)].map((m) => m[2]);
    expect(hashed.length).toBeGreaterThanOrEqual(6);
    const trigger = latestFunctionBody('contract_signed_content_is_final');
    for (const field of hashed) expect(trigger, `signed field ${field} is not frozen`).toMatch(new RegExp(`NEW\\.${field}\\s+IS DISTINCT FROM OLD\\.${field}`));
    expect(trigger).toMatch(/IN \('draft', 'pending_signature'\)/);
    expect(migrations).toMatch(/CREATE TRIGGER contract_signed_content_is_final_trg\s+BEFORE UPDATE ON public\.contracts/);
  });

  it('every appendix field the signature hashes is frozen, and removal is refused', () => {
    const apx = contractSign.slice(contractSign.indexOf('appendices: appendices.map'), contractSign.indexOf('// Record signature'));
    const hashed = [...apx.matchAll(/^\s+(\w+): a\.\w+/gm)].map((m) => m[1]);
    expect(hashed.length).toBeGreaterThanOrEqual(5);
    const trigger = latestFunctionBody('contract_appendix_follows_the_signature');
    for (const field of hashed) expect(trigger, `signed appendix field ${field} is not frozen`).toMatch(new RegExp(`NEW\\.${field}\\s+IS NOT DISTINCT FROM OLD\\.${field}`));
    expect(migrations).toMatch(/CREATE TRIGGER contract_appendix_follows_the_signature_trg\s+BEFORE INSERT OR UPDATE OR DELETE ON public\.contract_documents/);
  });

  it('a signed agreement is not sent again, and a send that cannot build a link writes nothing', () => {
    const start = agentExecute.indexOf("if (skillName === 'send_contract_for_signature') {");
    const send = agentExecute.slice(start, agentExecute.indexOf('signing_url', start));
    expect(send).toMatch(/!\['draft', 'pending_signature'\]\.includes\(String\(contract\.status\)\)/);
    const originCheck = send.indexOf('Public Site URL is not configured');
    const firstWrite = send.search(/\.from\('contract(s|_versions)'\)\s*\.(insert|update)\(/);
    expect(originCheck).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(originCheck, 'the URL check must come before the first write').toBeLessThan(firstWrite);
  });
});

describe('the signature gives the contract its service', () => {
  it('the contract IS the reference of a contract-born subscription', () => {
    const body = latestFunctionBody('subscriptions_provider_needs_reference');
    expect(body).toMatch(/IF NEW\.provider = 'contract' THEN\s+IF NEW\.contract_id IS NULL THEN/);
    expect(latestFunctionBody('create_subscription_from_contract')).toMatch(/'contract', c\.id/);
  });

  it('contract-sign does not swallow a service that was not created', () => {
    expect(contractSign).not.toMatch(/service creation skipped/);
    expect(contractSign).toMatch(/SERVICE NOT CREATED/);
    expect(contractSign).toMatch(/from\('agent_activity'\)\.insert\(/);
    expect(contractSign).toMatch(/service_created: false/);
  });

  it('the repair door asks who is calling and whether the contract is signed', () => {
    const body = latestFunctionBody('create_service_from_signed_contract');
    expect(body).toMatch(/can_access_module\(auth\.uid\(\), 'contracts'\)/);
    expect(body).toMatch(/v_signed IS NULL OR v_status <> 'active'/);
  });

  it('an agent can draft from the quote', () => {
    expect(agentExecute).toMatch(/\['title', 'start_date', 'end_date', 'value_cents', 'currency', 'quote_id'\]/);
  });
});
