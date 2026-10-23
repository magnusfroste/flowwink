import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: what the customer signs is finished — the agreement AND its appendices.
 *
 * Found on optic (2026-10-19) attaching the Privat AI product specification as an
 * appendix to a test agreement:
 *  1. An appendix attached from a template was stored RAW — the data-processing
 *     appendix read "{{counterparty.name}}" and "[HUVUDAVTALETS NUMMER]".
 *  2. Nothing stopped a half-finished agreement going out: the send only checked
 *     that the text was not empty (15 unresolved [BRACKETS] would have shipped).
 *
 * Verified live on the sandbox inside BEGIN … ROLLBACK before merge: the moved
 * renderer produced byte-identical bodies to the old one for a template using
 * every token; the appendix rendered and named its parent; the trigger refused
 * the send listing each bracket; links, checkboxes and [x] passed.
 */
const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIG = 'supabase/migrations/20261023100000_bilagan-renderas-avtalet-skickas-klart.sql';

describe('contract appendices are rendered, and an agreement is sent only when finished', () => {
  const sql = read(MIG);
  const previous = read('supabase/migrations/20261002200000_villkorslanken-far-ett-engelskt-standardvarde.sql');

  it('ONE renderer: every replacement the old body made lives in _render_contract_tokens, and the creator calls it', () => {
    const renderer = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public._render_contract_tokens'), sql.indexOf('REVOKE ALL ON FUNCTION public._render_contract_tokens'));
    const tokens = [...previous.matchAll(/replace\(v_body, '([^']+)'/g)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(30);
    for (const t of new Set(tokens)) expect(renderer, `renderer lost ${t}`).toContain(`replace(v_body, '${t}'`);

    const creator = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.create_contract_from_template'));
    const creatorBody = creator.slice(0, creator.indexOf('$$;'));
    expect(creatorBody).toMatch(/v_body := public\._render_contract_tokens\(v_tpl\.body_markdown, jsonb_build_object\(/);
    // no second copy of the replace chain left behind in the creator
    expect(creatorBody).not.toMatch(/replace\(v_body, '\{\{counterparty\.name\}\}'/);
  });

  it('an appendix — from a template or written inline — goes through the same renderer and names its parent', () => {
    const appendix = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.manage_contract_appendix'));
    const body = appendix.slice(0, appendix.indexOf('$$;'));
    expect(body).toMatch(/v_body := public\._render_appendix_body\(v_tpl\.body_markdown, p_contract_id\)/);
    expect(body).toMatch(/v_body := public\._render_appendix_body\(p_body_markdown, p_contract_id\)/);
    expect(sql).toMatch(/'\[HUVUDAVTALETS NUMMER\]', COALESCE\(v_number, '\[HUVUDAVTALETS NUMMER\]'\)/);
  });

  it('the send is refused on every path while a token or a bracket remains; a missing appendix only warns', () => {
    expect(sql).toMatch(/CREATE TRIGGER contract_sent_only_when_ready_trg\s+BEFORE UPDATE OF status ON public\.contracts/);
    expect(sql).toMatch(/IF OLD\.status = 'draft' AND NEW\.status = 'pending_signature' THEN/);
    expect(sql).toMatch(/'unrendered_token'/);
    expect(sql).toMatch(/'unresolved_bracket'/);
    // a markdown link [Text](url) is not a decision left open
    expect(sql).toMatch(/\(\?!\\\(\)/);
    expect(sql).toMatch(/'appendix_not_attached'/);
    // the trigger elevates nothing: it calls the owner-only check, never set_config on the role
    expect(sql).not.toMatch(/set_config\('request\.jwt/);
    expect(sql).toMatch(/v_r := public\._contract_signing_readiness\(NEW\.id\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._contract_signing_readiness\(uuid\) FROM PUBLIC, anon, authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\._contract_signing_readiness\(uuid\) TO service_role;/);
  });

  it('send_contract_for_signature asks first — before the version snapshot or the token is written', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    const send = ae.slice(ae.indexOf("if (skillName === 'send_contract_for_signature')"));
    const ask = send.indexOf("supabase.rpc('contract_signing_readiness'");
    expect(ask).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(send.indexOf("from('contract_versions').insert"));
    expect(ask).toBeLessThan(send.indexOf("status: 'pending_signature'"));
    expect(send.slice(ask, ask + 1200)).toMatch(/not ready to send for signature — unresolved: \$\{unresolved\}/);
  });

  it('the nightly battery proves both, on an agreement of its own', () => {
    const scenario = read('scripts/process-battery/scenarios/sign-to-serve.ts');
    expect(scenario).toMatch(/an appendix from a template is rendered with the agreement\\'s own facts/);
    expect(scenario).toMatch(/an agreement with an unresolved \[BRACKET\] is not sent for signature/);
  });
});
