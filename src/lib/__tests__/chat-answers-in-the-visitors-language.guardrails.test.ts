/**
 * Guardrail: the public chat answers in the visitor's language.
 *
 * Only the email register told the model to answer in the sender's language,
 * so on a site whose identity names Swedish, an English question on the
 * English page got a Swedish answer (Nordbrygg, 2026-10-25). Every channel
 * other than email now gets the same rule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(__dirname, '../../../supabase/functions/chat-completion/index.ts'),
  'utf-8',
);

describe('chat-completion answers in the visitor language', () => {
  it('states the rule and overrides a named site language', () => {
    expect(source).toMatch(/VISITOR_LANGUAGE_RULE =[\s\S]*language of the visitor's latest message/);
    expect(source).toMatch(/VISITOR_LANGUAGE_RULE =[\s\S]*even if other instructions above name a site language/);
  });

  it('applies it to every channel that is not email', () => {
    expect(source).toMatch(
      /if \(channel === 'email'\) chatPrompt \+= buildEmailRegister\(emailContext\);\s*else chatPrompt \+= VISITOR_LANGUAGE_RULE;/,
    );
  });
});
