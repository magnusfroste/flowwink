/**
 * No skill hides its own AI call (2026-10-31). Three skills in agent-execute
 * reached past the platform for Gemini / gpt keys of their own:
 * send_email_to_lead drafted a mail (English by default, or a canned
 * "would you be open to a short conversation this week?" without a key) and
 * then SENT it to a real lead; lead_nurture_sequence drafted "Thank you for
 * your interest!"; the SEO helpers asked gemini-2.5-flash / gpt-4o-mini
 * directly, whatever System AI said. The operator writes what goes out — it
 * knows the lead, the business and the language — and a helper that must
 * generate runs on the platform's own AI (resolveAiConfig + callAi).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const exec = read('supabase/functions/agent-execute/index.ts');
const between = (from: string, to: string) => exec.slice(exec.indexOf(from), exec.indexOf(to, exec.indexOf(from)));

describe('agent-execute calls no AI provider directly', () => {
  it('no Gemini or OpenAI endpoint, no provider key read', () => {
    expect(exec).not.toMatch(/generativelanguage\.googleapis\.com/);
    expect(exec).not.toMatch(/api\.openai\.com/);
    expect(exec).not.toMatch(/Deno\.env\.get\('(GEMINI|OPENAI)_API_KEY'\)/);
  });
  it('the short-text helper runs on System AI', () => {
    const helper = between('async function generateShortText(', '\n}\n');
    expect(helper).toContain("resolveAiConfig(supabase, 'fast')");
    expect(helper).toContain('callAi(');
  });
});

describe('a lead mail is the operator’s text or nothing', () => {
  const send = between('async function executeSendEmailToLead(', '\n}\n');
  const nurture = between("if (skillName === 'lead_nurture_sequence') {", '// send_newsletter');

  it('send_email_to_lead refuses a missing body or subject, with the lead to write from', () => {
    expect(send).toContain("writtenMailBody(supabase, args, 'send_email_to_lead'");
    expect(send).toMatch(/if \('status' in body\) return \{ \.\.\.body, sent: false, lead: leadContext \}/);
    expect(send).toMatch(/code: 'CONTENT_REQUIRED'[\s\S]*lead: leadContext/);
    expect(send).not.toMatch(/fallback template|purposeLabels|short conversation this week/);
  });
  it('the refusal comes before anything is sent', () => {
    expect(send.indexOf("'status' in body")).toBeLessThan(send.indexOf('/functions/v1/email-send'));
  });
  it('lead_nurture_sequence saves only what it was given', () => {
    expect(nurture).toContain("writtenMailBody(supabase, args as Record<string, unknown>, 'lead_nurture_sequence'");
    expect(nurture).not.toMatch(/Thank you for your interest/);
    expect(nurture).toContain("review_url: '/admin/newsletter'");
  });
  it('both read the site’s language, not a hardcoded en', () => {
    expect(send).not.toMatch(/language = 'en'/);
    expect(nurture).not.toMatch(/language = 'en'/);
  });
});

describe('the skill contract says so — FlowPilot and MCP agents read the same seeds', () => {
  const crm = read('src/lib/modules/crm-module.ts');
  const nl = read('src/lib/modules/newsletter-module.ts');
  const seed = (src: string, name: string) => src.slice(src.indexOf(`name: '${name}',`), src.indexOf('\n  },\n', src.indexOf(`name: '${name}',`)));

  it('send_email_to_lead takes content_md and no longer promises an AI draft', () => {
    const s = seed(crm, 'send_email_to_lead');
    expect(s).toContain('content_md:');
    expect(s).not.toMatch(/AI-drafts|auto-generated if omitted|custom_instructions:/);
  });
  it('lead_nurture_sequence requires subject + content_md', () => {
    const s = seed(nl, 'lead_nurture_sequence');
    expect(s).toMatch(/required: \[\s*'lead_id',\s*'sequence_type',\s*'subject',\s*'content_md',\s*\]/);
    expect(s).not.toMatch(/AI-written/);
  });
});
