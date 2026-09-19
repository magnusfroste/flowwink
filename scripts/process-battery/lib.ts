/**
 * Process battery — shared harness.
 *
 * A scenario drives one business process the way an external operator would
 * (skills through agent-execute, service-key caller = what the MCP gateway
 * sends) and then reads the END STATE back from the database. The parity
 * matrix says a capability exists; the battery says the process holds: the
 * books balance, the stock adds up, no more is paid out than was sold.
 *
 * The battery WRITES. It only runs against a local stack: the target comes
 * from the environment, and a non-local host is refused.
 *
 *   BATTERY_FN_URL   default http://127.0.0.1:54321/functions/v1
 *   BATTERY_DB_URL   default postgresql://postgres:postgres@127.0.0.1:54322/postgres
 *   SUPABASE_SERVICE_ROLE_KEY   the LOCAL stack's service key (`supabase status -o env`)
 */
import { Client } from 'pg';

const FN_URL = (process.env.BATTERY_FN_URL ?? 'http://127.0.0.1:54321/functions/v1').replace(/\/$/, '');
const DB_URL = process.env.BATTERY_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);

export function assertLocalTarget(): void {
  for (const [label, raw] of [['BATTERY_FN_URL', FN_URL], ['BATTERY_DB_URL', DB_URL]] as const) {
    const host = new URL(raw).hostname;
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error(`${label} points at ${host}. The process battery writes business data and only runs against a local stack.`);
    }
  }
  if (!SERVICE_KEY) {
    throw new Error('Set SUPABASE_SERVICE_ROLE_KEY to the LOCAL stack\'s service key (supabase status -o env).');
  }
}

export type CheckStatus = 'pass' | 'fail' | 'skip';
export interface CheckResult { name: string; status: CheckStatus; detail?: string }

export interface SkillOutcome<T = Record<string, unknown>> {
  ok: boolean;
  /** The skill's own payload (the innermost `result`). */
  data: T;
  error: string;
  raw: unknown;
}

export class Scenario {
  readonly checks: CheckResult[] = [];
  /** Unique per run, so reruns never collide on natural keys (sku, email, number). */
  readonly tag: string;
  private db: Client;

  constructor(readonly process: string, db: Client) {
    this.db = db;
    this.tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  /**
   * Run a skill as the gateway would, and walk the approval handshakes the way
   * a real deployment does: a STAGED operation is approved by the operator
   * itself (approve_pending_operation → re-invoke with _approved_operation_id),
   * a trust-level `approve` skill waits for a HUMAN — played here through
   * resolve_approval, the RPC the admin approval inbox calls. Both are recorded
   * in `handshakes` so a scenario can assert that a gate was (or was not) there.
   * Never throws on a skill error — read `.ok`.
   */
  async skill<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}): Promise<SkillOutcome<T>> {
    let out = await this.invoke<T>(name, args);
    const extra: Record<string, unknown> = {};
    for (let hop = 0; hop < 3; hop++) {
      const top = (out.raw ?? {}) as Record<string, unknown>;
      if (top.staged === true && typeof top.operation_id === 'string') {
        this.handshakes.push({ skill: name, gate: 'staged' });
        const approved = await this.invoke('approve_pending_operation', { p_id: top.operation_id });
        if (!approved.ok) return { ...out, ok: false, error: `approve_pending_operation: ${approved.error}` };
        extra._approved_operation_id = top.operation_id;
      } else if (top.status === 'pending_approval' && typeof top.approval_request_id === 'string') {
        this.handshakes.push({ skill: name, gate: 'human' });
        await this.asService(`select public.resolve_approval($1::uuid, 'approve', 'process battery: human approver')`, [top.approval_request_id]);
        extra._approved = true;
        extra._approval_request_id = top.approval_request_id;
      } else break;
      out = await this.invoke<T>(name, { ...args, ...extra });
    }
    return out;
  }

  readonly handshakes: Array<{ skill: string; gate: 'staged' | 'human' }> = [];

  /** SQL as the service role (what an RPC sees when the gateway calls it). */
  async asService<R = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<R[]> {
    await this.db.query('begin');
    try {
      await this.db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
      const rows = (await this.db.query(query, params)).rows as R[];
      await this.db.query('commit');
      return rows;
    } catch (e) {
      await this.db.query('rollback');
      throw e;
    }
  }

  private async invoke<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}): Promise<SkillOutcome<T>> {
    let raw: unknown;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${FN_URL}/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ skill_name: name, arguments: args, agent_type: 'mcp' }),
        signal: AbortSignal.timeout(90_000),
      });
      const text = await res.text();
      try { raw = JSON.parse(text); } catch { raw = { error: `non-JSON ${res.status}: ${text.slice(0, 200)}` }; }
      // The local edge runtime sheds load under parallel scenarios; that is the
      // harness's weather, not the process's verdict.
      // Retry ONLY what certainly never ran: the runtime refusing to boot a worker (546/503), or
      // agent-execute itself reporting that ITS call upstream got no answer. A bare 502 from the
      // gateway is ambiguous — the skill may have landed — and retrying it turned a billed
      // contract into a false "not due until" (2026-09-19). Skills are not all idempotent.
      const transient = res.status === 546 || res.status === 503 || /WORKER_(LIMIT|ERROR)|worker.*(boot|limit)|invalid response was received from the upstream server|name resolution failed/i.test(text);
      if (!transient || attempt >= 3) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    const outer = (raw ?? {}) as Record<string, unknown>;
    const inner = (outer.result ?? outer) as Record<string, unknown>;
    const innermost = (inner && typeof inner === 'object' && 'result' in inner && inner.result && typeof inner.result === 'object'
      ? inner.result
      : inner) as Record<string, unknown>;
    const error = String(
      (innermost as { error?: unknown })?.error ?? (inner as { error?: unknown })?.error ?? outer.error ?? '',
    );
    const workerDown = typeof outer.code === 'string' && /^WORKER_/.test(outer.code);
    const failed = workerDown || Boolean(error) || (inner as { status?: unknown })?.status === 'error' || (innermost as { success?: unknown })?.success === false;
    return { ok: !failed, data: innermost as T, error: error || (workerDown ? `edge runtime: ${String(outer.code)}` : ''), raw };
  }

  /** A step the process cannot continue without. Records a failed check and throws. */
  async must<T = Record<string, unknown>>(step: string, name: string, args: Record<string, unknown> = {}): Promise<T> {
    const out = await this.skill<T>(name, args);
    if (!out.ok) {
      this.checks.push({ name: step, status: 'fail', detail: `${name}: ${out.error || JSON.stringify(out.raw).slice(0, 300)}` });
      throw new ScenarioAbort(step);
    }
    this.checks.push({ name: step, status: 'pass' });
    return out.data;
  }

  /** A step the process must REFUSE (over-refund, over-return, closed period …). */
  async mustRefuse(step: string, name: string, args: Record<string, unknown>, because: RegExp): Promise<void> {
    const out = await this.skill(name, args);
    if (out.ok) {
      this.checks.push({ name: step, status: 'fail', detail: `${name} was accepted: ${JSON.stringify(out.data).slice(0, 300)}` });
    } else if (!because.test(out.error)) {
      this.checks.push({ name: step, status: 'fail', detail: `${name} refused, but for another reason: ${out.error.slice(0, 300)}` });
    } else {
      this.checks.push({ name: step, status: 'pass' });
    }
  }

  async sql<R = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<R[]> {
    return (await this.db.query(query, params)).rows as R[];
  }

  async one<R = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<R | undefined> {
    return (await this.sql<R>(query, params))[0];
  }

  /**
   * The id of the thing a skill just created. Handlers answer in several
   * shapes ({product_id}, {id}, {item:{id}}, {order:{id}}); a scenario names
   * the noun and this finds it, or fails the run loudly with the payload.
   */
  idOf(data: Record<string, unknown>, noun: string): string {
    const nested = (k: string) => (data[k] && typeof data[k] === 'object' ? (data[k] as Record<string, unknown>).id : undefined);
    const found = data[`${noun}_id`] ?? nested(noun) ?? nested('item') ?? nested('record') ?? nested('data') ?? data.id;
    if (typeof found !== 'string') throw new Error(`no ${noun} id in ${JSON.stringify(data).slice(0, 300)}`);
    return found;
  }

  check(name: string, condition: boolean, detail?: string): void {
    this.checks.push({ name, status: condition ? 'pass' : 'fail', detail: condition ? undefined : detail });
  }

  equal(name: string, actual: unknown, expected: unknown): void {
    const same = String(actual) === String(expected);
    this.check(name, same, `expected ${String(expected)}, got ${String(actual)}`);
  }

  /** An announced skip: the precondition is missing, and the report says so. */
  skip(name: string, why: string): void {
    this.checks.push({ name, status: 'skip', detail: why });
  }

  /** Every journal entry this reference produced balances, line by line. */
  async booksBalance(name: string, where: string, params: unknown[]): Promise<void> {
    const rows = await this.sql<{ id: string; debit: string; credit: string }>(
      `select e.id, coalesce(sum(l.debit_cents),0) as debit, coalesce(sum(l.credit_cents),0) as credit
         from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
        where ${where} group by e.id`, params);
    if (rows.length === 0) { this.check(name, false, 'no journal entry found'); return; }
    const off = rows.filter((r) => r.debit !== r.credit || r.debit === '0');
    this.check(name, off.length === 0, `unbalanced or empty: ${JSON.stringify(off)}`);
  }
}

export class ScenarioAbort extends Error {
  constructor(step: string) { super(`aborted at: ${step}`); }
}

export interface ScenarioModule {
  /** Must equal the process doc's basename (docs/processes/<process>.md). */
  process: string;
  run(s: Scenario): Promise<void>;
}

export async function connect(): Promise<Client> {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  return db;
}
