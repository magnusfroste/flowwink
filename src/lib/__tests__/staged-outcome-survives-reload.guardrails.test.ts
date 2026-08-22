/**
 * Guardrails: utfallet av ett godkännande måste överleva en omladdning.
 *
 * Verkligt fel (FlowWork, 2026-08): en admin klickade "Godkänn & utför" på en
 * staged operation. Den kördes, den misslyckades, och agent-execute lämnade
 * ifrån sig ett utmärkt självrättande felmeddelande ("missing required
 * parameter(s) title …"). Admin uppfattade det som att "ingenting hände" —
 * för utfallet fanns bara i React-state:
 *
 *   • resolveStaged gjorde enbart setMessages(...), inget persisterades,
 *   • felet renderades som en liten grå detaljrad under kortet,
 *   • vid omladdning återskapades meddelandet UTAN utfall — en åtgärd som
 *     hade körts och fallit såg exakt likadan ut som en som aldrig kördes.
 *
 * Sanningen fanns hela tiden i `pending_operations` (status='failed',
 * execution_result = hela felet). Ingen chattyta läste den.
 *
 * Detta är veckans dominerande buggklass i projektet: "tyst halvframgång".
 * Spärrarna nedan låser tre saker:
 *
 *   1. Ett misslyckat utförande kan ALDRIG återkomma som "väntar på beslut".
 *      outcomeFromPendingOperation returnerar null endast för en operation som
 *      genuint fortfarande väntar på ett mänskligt beslut.
 *   2. EN skrivare per sanning: utfallet duplicieras aldrig in i chattraden —
 *      chattraden bär identiteten (operation_id), pending_operations bär
 *      utfallet, och historiken läser tillbaka det.
 *   3. Felet får inte trunkeras. Meddelandena ÄR instruktionen för hur felet
 *      rättas; halva meddelandet är värdelöst för den som ska fixa det.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractExecutionError,
  isUnfinished,
  outcomeFromPendingOperation,
  summarizeExecutionResult,
  toPersistableStaged,
  type StagedResolution,
} from '../staged-action-outcome';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** The real message that started this — verbatim shape, not a paraphrase. */
const REAL_FAILURE = {
  error:
    'Not staged: missing required parameter(s) title for skill "write_blog_post" (action "create").',
  hint: 'Call read_skill({name:"write_blog_post"}) for the full parameter list before retrying.',
};

describe('a failed execution can never come back as "väntar på beslut"', () => {
  it('status=failed resolves the card, never null', () => {
    const outcome = outcomeFromPendingOperation({
      id: 'op-1',
      status: 'failed',
      execution_result: REAL_FAILURE,
    });
    expect(outcome).not.toBeNull();
    expect(outcome!.resolution).toBe('failed');
    expect(isUnfinished(outcome!.resolution)).toBe(true);
  });

  it('a failure with no recorded reason still resolves — silence is not a pending decision', () => {
    const outcome = outcomeFromPendingOperation({ id: 'op-1', status: 'failed', execution_result: null });
    expect(outcome?.resolution).toBe('failed');
    expect(outcome?.note).toBeTruthy();
  });

  it('status=executed carrying an error IS a failure — status and result may not disagree', () => {
    // The silent-half-success class: a green status over a red result is
    // exactly how a failed write got painted as done.
    const outcome = outcomeFromPendingOperation({
      id: 'op-1',
      status: 'executed',
      execution_result: { error: 'Handler exception: relation "foo" does not exist' },
    });
    expect(outcome?.resolution).toBe('failed');
  });

  it('a successful result that merely talks is NOT turned into a failure', () => {
    // The mirror image of the bug. Only an explicit `error` counts as one —
    // a handler returning { message: 'Order created' } did its job.
    const outcome = outcomeFromPendingOperation({
      id: 'op-1',
      status: 'executed',
      execution_result: { message: 'Order created', order_id: 'o-9' },
    });
    expect(outcome?.resolution).toBe('executed');
  });

  it('a vanished operation resolves as expired — a dead approve button is not a decision', () => {
    const outcome = outcomeFromPendingOperation(null);
    expect(outcome?.resolution).toBe('expired');
    expect(isUnfinished('expired')).toBe(true);
  });

  it('an approval window that closed is expired, not pending', () => {
    const outcome = outcomeFromPendingOperation({
      id: 'op-1',
      status: 'pending',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(outcome?.resolution).toBe('expired');
  });

  it('approved-but-never-executed is NOT "Utförd"', () => {
    // approve_pending_operation ran, agent-execute never closed the loop
    // (double-gated skill, or the call never landed). Nothing was done.
    const outcome = outcomeFromPendingOperation({ id: 'op-1', status: 'approved', execution_result: null });
    expect(outcome?.resolution).toBe('approved');
    expect(outcome?.resolution).not.toBe('executed');
    expect(outcome?.note).toBeTruthy();
  });

  it('only a genuinely undecided operation returns null', () => {
    const outcome = outcomeFromPendingOperation({
      id: 'op-1',
      status: 'pending',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(outcome).toBeNull();
  });

  it('every non-pending status resolves to something', () => {
    for (const status of ['approved', 'rejected', 'executed', 'failed', 'expired']) {
      expect(
        outcomeFromPendingOperation({ id: 'op-1', status }),
        `status=${status} must resolve the card`,
      ).not.toBeNull();
    }
  });

  it('only executed counts as done', () => {
    const notDone: StagedResolution[] = ['failed', 'rejected', 'expired'];
    for (const r of notDone) expect(isUnfinished(r), r).toBe(true);
    expect(isUnfinished('executed')).toBe(false);
  });
});

describe('the error stays readable in full', () => {
  it('keeps the whole self-correcting message and its hint', () => {
    const note = outcomeFromPendingOperation({ id: 'op-1', status: 'failed', execution_result: REAL_FAILURE })!.note!;
    expect(note).toContain('missing required parameter(s) title');
    expect(note).toContain(REAL_FAILURE.hint);
    // Nothing clipped, nothing ellipsised.
    expect(note.length).toBeGreaterThanOrEqual(REAL_FAILURE.error.length);
    expect(note).not.toContain('…');
  });

  it('a very long message is not truncated', () => {
    const long = 'x'.repeat(4000);
    expect(extractExecutionError({ error: long })).toBe(long);
  });

  it('digs the message out of a nested envelope', () => {
    expect(extractExecutionError({ result: { error: 'nested boom' } })).toBe('nested boom');
    expect(extractExecutionError('plain string boom')).toBe('plain string boom');
    expect(extractExecutionError({ ok: true })).toBeUndefined();
  });

  it('a success summary stays a summary — it is not an error channel', () => {
    expect(summarizeExecutionResult({ id: 'abc', title: 'Hej', extra: 1, fourth: 2 })).toBe(
      'id: abc · title: Hej · extra: 1',
    );
    expect(summarizeExecutionResult(null)).toBeUndefined();
  });
});

describe('one writer per truth: the chat row never stores the outcome', () => {
  it('toPersistableStaged strips resolution and result_note', () => {
    const persisted = toPersistableStaged([
      {
        operation_id: 'op-1',
        skill: 'write_blog_post',
        args: { title: 'x' },
        reinvoke_args: { _approved_operation_id: 'op-1' },
        resolution: 'failed',
        result_note: 'boom',
      },
    ]);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).not.toHaveProperty('resolution');
    expect(persisted[0]).not.toHaveProperty('result_note');
    // The identity must survive — without operation_id the outcome can never
    // be looked up again.
    expect(persisted[0].operation_id).toBe('op-1');
    expect(persisted[0].skill).toBe('write_blog_post');
  });

  it('history reads the outcome back from pending_operations', () => {
    const src = read('src/hooks/useWorkspaceSessions.ts');
    expect(src, 'loadMessages must rehydrate staged actions').toMatch(/metadata\?\.staged/);
    expect(src, 'and must query the table that owns the outcome').toContain("from('pending_operations')");
    expect(src).toContain('outcomeFromPendingOperation');
    expect(src, 'execution_result is the diagnosis').toContain('execution_result');
  });

  it('the chat message is persisted with the staged identity', () => {
    const src = read('src/pages/admin/WorkspaceChatPage.tsx');
    expect(src).toContain('toPersistableStaged');
    expect(src, 'the raw staged array must not be written unfiltered').not.toMatch(
      /appendMessage\([^)]*\{\s*citations,\s*staged\s*\}/,
    );
  });

  it('resolveStaged stays presentation-only — it must not write a second copy', () => {
    const src = read('src/hooks/useWorkspaceChat.ts');
    const body = src.slice(src.indexOf('const resolveStaged'), src.indexOf('const stop'));
    expect(body, 'no DB write may live in resolveStaged').not.toContain('supabase');
  });
});

describe('the card shows that nothing happened', () => {
  const card = read('src/components/admin/workspace/StagedActionCard.tsx');

  it('renders the failure with the destructive token, not as a grey detail line', () => {
    expect(card).toContain('border-destructive/40');
    expect(card).toContain('Ingenting utfördes.');
  });

  it('prints the note with wrapping, never truncated or clamped', () => {
    expect(card).toContain('whitespace-pre-wrap');
    expect(card).not.toContain('line-clamp');
    // `truncate` is legitimate on the argument preview rows above, but must
    // never be applied to the result note.
    expect(card).not.toMatch(/truncate[^\n]*result_note|result_note[^\n]*truncate/);
  });

  it('separates "utförd" from "godkänd men obekräftad"', () => {
    expect(card).toContain('Utförd');
    expect(card).toContain('Godkänd – utförande obekräftat');
  });

  it('derives its outcome from the operation row instead of trusting the invoke reply', () => {
    expect(card).toContain('outcomeFromPendingOperation');
    expect(card).toContain("from('pending_operations')");
  });

  it('uses design tokens, no raw hex colors', () => {
    expect(card).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
