import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  filterRecipients,
  blockedResponse,
} from '../../../supabase/functions/_shared/email-allowlist';

/**
 * The rule: while Optic Tunnels — a live company — runs FlowWink in
 * development, no invoice may reach a customer inbox. Test mail goes to
 * *@liteit.se and nowhere else.
 *
 * Enforced by care, that rule fails the first time anyone forgets. These tests
 * hold the version that cannot: the recipient never leaves the building.
 */

/** Minimal stand-in for the Supabase client: one setting, one read. */
function settingsClient(value: unknown, opts: { fail?: boolean } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            opts.fail
              ? { data: null, error: { message: 'connection reset' } }
              : { data: value === undefined ? null : { value }, error: null },
        }),
      }),
    }),
  };
}

const OPTIC = { enabled: true, domains: ['liteit.se'], addresses: [], reason: 'Utvecklingsfas' };

describe('the allowlist withholds everything it was not told to send to', () => {
  it('lets a liteit.se address through and holds a customer back', async () => {
    const d = await filterRecipients(settingsClient(OPTIC), ['magnus@liteit.se', 'knut@optictunnels.eu']);
    expect(d.allowed).toEqual(['magnus@liteit.se']);
    expect(d.blocked.map((b) => b.address)).toEqual(['knut@optictunnels.eu']);
    expect(d.active).toBe(true);
  });

  it('carries the reason the operator configured, so the block is explicable', async () => {
    const d = await filterRecipients(settingsClient(OPTIC), ['kund@example.com']);
    expect(d.blocked[0].reason).toContain('Utvecklingsfas');
  });

  it('accepts an exact address outside the allowed domains', async () => {
    const cfg = { enabled: true, domains: [], addresses: ['revisor@byran.se'] };
    const d = await filterRecipients(settingsClient(cfg), ['revisor@byran.se', 'annan@byran.se']);
    expect(d.allowed).toEqual(['revisor@byran.se']);
    expect(d.blocked).toHaveLength(1);
  });

  it('does NOT treat a subdomain as the allowed domain', async () => {
    // mail.liteit.se is a different mailbox from liteit.se. Guessing they are
    // the same is how a guard leaks.
    const d = await filterRecipients(settingsClient(OPTIC), ['x@mail.liteit.se']);
    expect(d.allowed).toEqual([]);
  });

  it('strips "Name <addr>" before deciding — the format callers actually send', async () => {
    const d = await filterRecipients(settingsClient(OPTIC), ['Magnus Froste <magnus@liteit.se>']);
    expect(d.allowed).toEqual(['magnus@liteit.se']);
  });

  it('is case-insensitive on both sides', async () => {
    const d = await filterRecipients(settingsClient({ ...OPTIC, domains: ['LiteIT.se'] }), ['Magnus@LITEIT.SE']);
    expect(d.allowed).toHaveLength(1);
  });
});

describe('off unless switched on — production instances are untouched', () => {
  it('no setting at all means no filtering', async () => {
    const d = await filterRecipients(settingsClient(undefined), ['anyone@anywhere.com']);
    expect(d.allowed).toEqual(['anyone@anywhere.com']);
    expect(d.active).toBe(false);
  });

  it('enabled:false means no filtering', async () => {
    const d = await filterRecipients(settingsClient({ enabled: false, domains: ['liteit.se'] }), ['kund@x.se']);
    expect(d.allowed).toEqual(['kund@x.se']);
    expect(d.active).toBe(false);
  });
});

describe('it FAILS CLOSED', () => {
  it('an unreadable setting blocks everything rather than sending', async () => {
    // The failure modes are asymmetric: an email that should not have gone out
    // cannot be recalled; a send that did not happen can be retried.
    const d = await filterRecipients(settingsClient(null, { fail: true }), ['magnus@liteit.se']);
    expect(d.allowed).toEqual([]);
    expect(d.active).toBe(true);
    expect(d.error).toMatch(/fails CLOSED on purpose/);
  });
});

describe('a blocked send is never reported as a sent one', () => {
  it('answers success:false — the envelope-lie class', async () => {
    const d = await filterRecipients(settingsClient(OPTIC), ['kund@optictunnels.eu']);
    const r = blockedResponse(d);
    expect(r.success).toBe(false);
    expect(r.blocked_by_allowlist).toBe(true);
    expect(Array.isArray(r.blocked)).toBe(true);
  });

  it('says how to change it, and says NOT to route around it', async () => {
    const r = blockedResponse(await filterRecipients(settingsClient(OPTIC), ['x@y.se']));
    expect(String(r.how_to_change)).toMatch(/site_settings\.email_allowlist/);
    expect(String(r.how_to_change)).toMatch(/Do NOT work around this by editing the recipient/);
  });

  it('the note tells the caller the withheld ones were NOT sent', async () => {
    const d = await filterRecipients(settingsClient(OPTIC), ['a@liteit.se', 'b@x.se']);
    expect(d.note).toMatch(/must not be reported as sent/);
  });
});

// ---------------------------------------------------------------------------
// The part that survives the code growing
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const FUNCTIONS_DIR = resolve(__dirname, '../../../supabase/functions');

describe('every outbound rail is gated — including the ones that bypass email-send', () => {
  /**
   * The finding that made this test necessary: three files call Resend
   * directly instead of going through email-send, and one of them is the
   * INVOICE mail. Guarding only email-send would have left exactly the send a
   * company in a pilot phase most needs held back.
   */
  const senders = walk(FUNCTIONS_DIR)
    .filter((f) => readFileSync(f, 'utf-8').includes('https://api.resend.com/emails'));

  it('finds the direct callers at all — if this hits zero the detector broke', () => {
    expect(senders.length).toBeGreaterThan(0);
  });

  it('each one imports the allowlist, or is an explicitly exempt prober', () => {
    // check-integrations pings the provider's own API to report health; it
    // addresses no human and has nothing to withhold.
    const EXEMPT = ['check-integrations.ts'];
    for (const file of senders) {
      const src = readFileSync(file, 'utf-8');
      const name = file.split('/').pop()!;
      if (EXEMPT.includes(name)) continue;
      expect(src, `${name} calls Resend directly without importing the allowlist`)
        .toMatch(/filterRecipients/);
    }
  });
});

describe('email-send applies it before it applies anything else', () => {
  const src = readFileSync(join(FUNCTIONS_DIR, 'email-send/index.ts'), 'utf-8');

  it('gates ahead of the suppression list', () => {
    expect(src.indexOf('filterRecipients')).toBeLessThan(src.indexOf('email_suppressions'));
  });

  it('logs a blocked send as blocked — not as skipped, and never as sent', () => {
    expect(src).toMatch(/status: "blocked"/);
  });

  it('returns the honest envelope', () => {
    expect(src).toMatch(/blockedResponse\(gate\)/);
  });
});

describe('the invoice mail goes through the router, so the guard has one home', () => {
  const src = readFileSync(join(FUNCTIONS_DIR, 'agent-execute/index.ts'), 'utf-8');

  /**
   * This block used to assert that agent-execute applied the allowlist itself
   * before calling Resend directly — which was true, and was the emergency fix.
   * Guarding the bypass was right on the day; leaving it there was not. A rule
   * enforced in two files is two copies that drift, and the second copy is
   * always the one nobody remembers when the rule changes (it took the
   * source-aware scope about an hour to prove that).
   *
   * The invoice now goes through email-send like every other send, so it
   * inherits the allowlist, provider fallback, the suppression list, the
   * branded shell and one outbound log instead of a private half of each.
   */
  it('does not talk to the provider directly at all', () => {
    expect(src).not.toMatch(/api\.resend\.com/);
  });

  it('sends it through email-send, tagged so the log can find it', () => {
    expect(src).toMatch(/functions\.invoke\('email-send'/);
    expect(src).toMatch(/source: 'send_invoice'/);
    expect(src).toMatch(/related_entity_type: 'invoice'/);
  });

  it('and still tells blocked apart from broken', () => {
    // The whole point of routing it: the reason must survive the extra hop.
    expect(src).toMatch(/blocked\?\.blocked_by_allowlist/);
    expect(src).toMatch(/Blocked and broken are different facts/);
  });

  it('never reports a simulated send as sent', () => {
    expect(src).toMatch(/\(sendData as EmailSendReply \| null\)\?\.simulated/);
    expect(src).toMatch(/leave a customer waiting for an invoice that never was/);
  });
});

// ---------------------------------------------------------------------------
// The layer above: a withheld send must not read as a delivered one
// ---------------------------------------------------------------------------

describe('a blocked send cannot be mistaken for a delivered one by its callers', () => {
  const src = readFileSync(join(FUNCTIONS_DIR, 'email-send/index.ts'), 'utf-8');

  /**
   * `supabase.functions.invoke` populates `error` only on a non-2xx response.
   * Returned as 200, a blocked send is invisible to every caller that checks
   * the transport error and not `data.success` — and three did exactly that:
   * dunning-processor inserted a dunning action, document-sign-request stamped
   * the request "sent", contract-billing-cron counted the reminder as gone out.
   * A 422 makes the guard true for callers that were written before it existed.
   */
  it('answers a fully blocked send with a non-2xx status', () => {
    const blockedBranch = src.slice(src.indexOf('blockedResponse(gate)'));
    const status = blockedBranch.match(/status:\s*(\d{3})/);
    expect(status, 'the blocked branch must set an explicit status').not.toBeNull();
    expect(Number(status![1]), 'a 2xx here reads as delivered to invoke()').toBeGreaterThanOrEqual(400);
  });

  it('still names the withheld recipients when the rest of the send succeeded', () => {
    // A send to [customer, internal] partially blocked: without this the
    // customer's silence looks like theirs rather than ours.
    expect(src).toMatch(/withheld_by_allowlist: gate\.blocked/);
  });
});

describe('nobody records state for a send that did not happen', () => {
  it('document-sign-request stamps "sent" only when the mail left', () => {
    const src = readFileSync(join(FUNCTIONS_DIR, 'document-sign-request/index.ts'), 'utf-8');
    // The update was unconditional: even a provider failure marked the request
    // sent. The property is that the write is guarded, whatever the guard is
    // named.
    const update = src.indexOf('status: "sent", sent_at');
    expect(update).toBeGreaterThan(-1);
    const before = src.slice(0, update);
    expect(before, 'the "sent" stamp must sit inside a success branch')
      .toMatch(/if \(!\w*[Ff]ailed\w*\)\s*\{/);
  });
});

describe('the guard knows who is sending, because that is where the risk lives', () => {
  // Optic blocked a colleague invitation to the company's OWN domain. The rule
  // was right — no invoice may reach a customer — but the guard could not tell
  // an invoice from an invitation, so it held both. A rail that fires on the
  // harmless case is a rail people switch off.
  const cfg = {
    enabled: true, domains: ['liteit.se'], addresses: [],
    scope: 'customer_facing', reason: 'pilot',
  };

  it('lets an internal sender through when scope is customer_facing', async () => {
    const d = await filterRecipients(settingsClient(cfg),
      ['peter@optictunnels.com'], 'invite-colleague');
    expect(d.allowed).toEqual(['peter@optictunnels.com']);
    expect(d.blocked).toEqual([]);
    expect(d.active).toBe(false);
    expect(d.note).toMatch(/sends to colleagues, not customers/);
  });

  it('still holds a customer-facing send from the same instance', async () => {
    const d = await filterRecipients(settingsClient(cfg),
      ['kund@example.com'], 'invoice');
    expect(d.allowed).toEqual([]);
    expect(d.blocked).toHaveLength(1);
    expect(d.active).toBe(true);
  });

  it('an UNKNOWN sender is guarded, not exempt', async () => {
    // The exempt list is short on purpose. A list of what to GUARD would fail
    // open the day someone adds a mailer and forgets to register it.
    const d = await filterRecipients(settingsClient(cfg),
      ['kund@example.com'], 'some-new-mailer');
    expect(d.allowed).toEqual([]);
    expect(d.active).toBe(true);
  });

  it('and scope defaults to ALL, so an upgrade never widens the rail', async () => {
    const { scope: _omitted, ...noScope } = cfg;
    const d = await filterRecipients(settingsClient(noScope),
      ['peter@optictunnels.com'], 'invite-colleague');
    expect(d.allowed).toEqual([]);
    expect(d.active).toBe(true);
  });
});
