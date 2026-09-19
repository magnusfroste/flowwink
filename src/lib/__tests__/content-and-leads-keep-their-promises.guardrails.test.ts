import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Content-to-conversion, lead-to-customer and support-to-resolution, process
 * battery 2026-09-19: scheduled publishing crashed on the first due page (text
 * into a uuid column) and never touched articles; a revoked newsletter consent
 * did not unsubscribe; an unsubscribe in another letter case changed nothing and
 * answered "unsubscribed"; merge_leads was refused by the activity ledger; the
 * same address in another case became a second lead; a deal landed on a
 * colleague; and a redelivered e-mail reply became a second comment.
 */

const root = join(__dirname, '../../..');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n');
const migration = readFileSync(join(root, 'supabase/migrations/20260919200000_innehallet-och-leadsen-haller-sina-loften.sql'), 'utf8');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');

function latestFunctionBody(fnName: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1; let m: RegExpExecArray | null;
  while ((m = re.exec(migrations))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const ends = ['$function$;', '$fn$;'].map((e) => migrations.indexOf(e, start)).filter((x) => x > -1);
  return migrations.slice(start, Math.min(...ends));
}

describe('scheduled publishing', () => {
  const body = latestFunctionBody('publish_scheduled_pages');
  it('takes pages AND blog posts, and never writes text into audit_logs.entity_id', () => {
    expect(body).toMatch(/FROM public\.pages/);
    expect(body).toMatch(/FROM public\.blog_posts/);
    expect(body).not.toMatch(/entity_id[\s\S]{0,200}::text/);
    expect(body).not.toMatch(/'cache',\s*v_(page|row)\.slug/);
  });
  it('one document that cannot be published does not take the others with it', () => {
    expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN[\s\S]*RAISE WARNING/);
  });
});

describe('consent and unsubscribe mean what they say', () => {
  it('a revoked newsletter consent unsubscribes — the link runs both ways', () => {
    expect(latestFunctionBody('newsletter_consent_reaches_the_subscriber')).toMatch(/NEW\.consent_type = 'newsletter' AND NEW\.status = 'revoked'/);
    expect(migration).toMatch(/CREATE TRIGGER newsletter_consent_reaches_the_subscriber_trg\s+AFTER INSERT ON public\.contact_consents/);
  });
  it('unsubscribe matches any letter case and answers from the rows it changed', () => {
    const i = agentExecute.indexOf("if (action === 'remove' && email) {");
    const b = agentExecute.slice(i, i + 1200);
    expect(b).toMatch(/\.ilike\('email'/);
    expect(b).toMatch(/nothing was unsubscribed/);
    expect(b).not.toMatch(/\.eq\('email', email\);\s*if \(error\)/);
  });
  it('the subscriber count counts a status the table has', () => {
    expect(agentExecute).not.toMatch(/head: true \}\)\.eq\('status', 'active'\)/);
  });
});

describe('one person is one lead', () => {
  it('lead addresses are stored lower-cased, and add_lead looks up the same way', () => {
    expect(migration).toMatch(/CREATE TRIGGER lead_email_is_lowercase_trg\s+BEFORE INSERT OR UPDATE OF email ON public\.leads/);
    expect(agentExecute).toMatch(/\.email\)\.trim\(\)\.toLowerCase\(\)/);
  });
  it('merge_leads announces its target and the ledger lets exactly that move through', () => {
    expect(migration).toMatch(/set_config\(''flowwink\.lead_merge_target'', p_primary_id::text, true\)/);
    expect(migration).toMatch(/current_setting\(''flowwink\.lead_merge_target'', true\)/);
    expect(migration).toMatch(/anchor missing in lead_activity_ledger_guard/);
    expect(migration).toMatch(/anchor missing in merge_leads/);
  });
  it('a deal goes to the person who was named, before the company\'s newest lead', () => {
    const i = agentExecute.indexOf('// The person the caller NAMED comes first.');
    expect(i).toBeGreaterThan(-1);
    const b = agentExecute.slice(i, i + 1200);
    expect(b.indexOf("ilike('email'")).toBeLessThan(b.indexOf("eq('company_id'"));
    expect(b).toMatch(/if \(!lead_id && !lead_email && resolvedCompanyId\)/);
  });
});

describe('a redelivered reply is the same reply', () => {
  it('the ticket remembers the inbound message ids it has taken in', () => {
    expect(agentExecute).toMatch(/if \(seenInbound\.has\(messageId\)\)/);
    expect(agentExecute).toMatch(/inbound_message_ids: \[\.\.\.seenInbound, messageId\]/);
  });
});
