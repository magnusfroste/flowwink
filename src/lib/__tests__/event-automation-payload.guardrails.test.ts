import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emailModule } from '../modules/email-module';

/**
 * An event automation reaches its skill through ONE channel: {{event.payload.x}}
 * templates in skill_arguments. The dispatcher says so in its own source — the
 * raw event object is deliberately not injected, because doing so broke the RPC
 * p_-prefix mapping.
 *
 * `inbound_email_to_ticket` shipped with `skill_arguments: {}` and a comment
 * claiming the dispatcher passes the event under `arguments.event`. It does not.
 * The automation fired 167 times, handed the skill an empty object every time,
 * and got back "message_id required" that nobody read. run_count climbed,
 * last_error stayed null, and the module page reported it healthy.
 *
 * This pins the three ends together — what the webhook emits, what the seed
 * maps, what the handler reads — so a renamed field fails here instead of
 * quietly resuming the same silence.
 */

const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf-8');

// The email.received payload is built in the shared ingest module — both the
// webhook and the reconcile poller go through it.
// The email.received payload is built in ONE place for every provider (Gmail
// via Composio, Cloudflare Email Routing): the shared filing path.
const ingest = read('supabase/functions/_shared/email/ingest-message.ts');
const dispatcher = read('supabase/functions/event-dispatcher/index.ts');
const agentExecute = read('supabase/functions/agent-execute/index.ts');

const automation = emailModule.automations?.find((a) => a.name === 'inbound_email_to_ticket');

/**
 * Keys the webhook puts on the email.received payload. Matches both `key: value`
 * and the shorthand `key,` — the payload uses both, and reading only the former
 * made this guard's first run accuse a correct mapping of being wrong.
 */
function emittedPayloadKeys(): Set<string> {
  const start = ingest.indexOf('_payload: {');
  const block = ingest.slice(start, ingest.indexOf('},', start));
  return new Set([...block.matchAll(/^\s{6}([a-z_]+)\s*[:,]/gm)].map((m) => m[1]));
}

/** Fields executeEmailToTicket reads off the event. */
function consumedFields(): Set<string> {
  const start = agentExecute.indexOf('async function executeEmailToTicket');
  const body = agentExecute.slice(start, start + 4000);
  const fields = new Set([...body.matchAll(/\bevt\.([a-z_]+)/g)].map((m) => m[1]));
  // `force` is a manual-replay override, deliberately never mapped by the automation.
  fields.delete('force');
  return fields;
}

/** payload keys referenced by the seed's templates. */
function mappedKeys(): Set<string> {
  const args = (automation?.skill_arguments ?? {}) as Record<string, unknown>;
  const keys = new Set<string>();
  for (const v of Object.values(args)) {
    const m = String(v).match(/^\{\{\s*event\.payload\.([a-z_]+)\s*\}\}$/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

describe('the dispatcher contract this depends on', () => {
  it('builds the skill arguments from templates and nothing else', () => {
    // Asserted structurally rather than against the explaining comment, which
    // wraps across lines and can be reworded. If the raw event is ever injected
    // again these mappings become redundant rather than load-bearing, and this
    // file should be revisited rather than deleted.
    const call = dispatcher.slice(dispatcher.indexOf('arguments: resolveTemplates'));
    expect(call.slice(0, 200)).toMatch(/arguments: resolveTemplates\(auto\.skill_arguments \|\| \{\}/);
    // No second source feeding `arguments` alongside the templates.
    expect(dispatcher.match(/^\s*arguments:/gm)?.length ?? 0).toBe(1);
  });

  it('leaves an unresolvable template as a literal, which is why keys must exist', () => {
    expect(dispatcher).toMatch(/v === undefined \? value : v/);
  });
});

describe('inbound_email_to_ticket wiring', () => {
  it('is seeded at all', () => {
    expect(automation).toBeDefined();
    expect(automation?.trigger_config).toMatchObject({ event: 'email.received' });
  });

  it('passes arguments — an empty map is the bug this guards', () => {
    expect(Object.keys(automation?.skill_arguments ?? {}).length).toBeGreaterThan(0);
  });

  it('maps message_id, without which the skill refuses every event', () => {
    expect(mappedKeys()).toContain('message_id');
  });

  it('only maps keys the webhook actually emits', () => {
    const emitted = emittedPayloadKeys();
    expect(emitted.size).toBeGreaterThan(5); // the extraction found a real block
    for (const key of mappedKeys()) {
      expect(
        emitted,
        `skill_arguments references event.payload.${key}, which composio-webhook ` +
          `does not emit. An unresolvable template is passed through as the literal ` +
          `string "{{event.payload.${key}}}".`,
      ).toContain(key);
    }
  });

  it('maps every field the handler reads', () => {
    const mapped = mappedKeys();
    for (const field of consumedFields()) {
      expect(
        mapped,
        `executeEmailToTicket reads evt.${field}, but no template supplies it — ` +
          `it will be undefined on every event.`,
      ).toContain(field);
    }
  });
});
