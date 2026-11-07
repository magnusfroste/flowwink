// The executor's contract, and nothing else: no imports, so a module that
// only needs the shape of a request (the pilot's reason.ts, ReasonConfig)
// never drags the 20k-line core into a program that cannot hold it — the
// app's tsc reaches reason.ts through its tests and checks the browser
// config (ES2020, strict off); the core is Deno's, checked by the deno
// typecheck ratchet. The core imports these and re-exports them.

export interface ExecuteRequest {
  skill_id?: string;
  skill_name?: string;
  arguments: Record<string, unknown>;
  agent_type: 'flowpilot' | 'chat' | 'mcp';
  conversation_id?: string;
  /** Trace ID from the parent reason() loop for end-to-end observability */
  trace_id?: string;
  /** When called via MCP, the user who owns the api_key. Used for ownership/created_by. */
  caller_user_id?: string;
  /** When called via MCP, the connected agent's name (a2a_peers.name). Stamps *_by_agent columns so a row says WHICH agent, not just "mcp". */
  caller_agent_name?: string;
  /** When called via MCP, the api_key id (and inbound peer) that initiated the call. */
  caller_api_key_id?: string;
  /** Run only if the call is a READ (read-surface classifyCall) — a live report block. */
  read_only?: boolean;
  /**
   * The VERIFIED email of a signed-in customer (identity ladder rung 2). Set by
   * chat-completion from the resolved JWT — NEVER from model output. Customer-
   * scoped skills (e.g. request_return) use it to enforce "acts on the caller's
   * own records only". Injected into args as `_caller_email`.
   */
  caller_email?: string;
  /**
   * Identity ladder rung 3 (B2B): the ACTIVE company + role of a signed-in
   * B2B contact, resolved by chat-completion from the verified JWT →
   * company_contacts membership — NEVER from model output. Company-scoped
   * skills use them to enforce "acts only within the caller's own company".
   * Injected into args as `_company_id` / `_company_role`. (P0 plumbing — no
   * company-scoped skill consumes them yet; wired in P1.)
   */
  company_id?: string;
  company_role?: string;
  objective_context?: {
    goal: string;
    step: string;
    why: string;
  };
  /**
   * The caller declares this run is an unattended scheduled tick (the
   * automation-dispatcher's cron lane), not something a human or an agent
   * asked for just now. Only such a run may have its journal row suppressed
   * when the skill declares it did nothing — see _shared/activity/work-done.ts.
   */
  scheduled?: boolean;
}

/** What the HTTP function authenticated: the service key, or a verified user JWT. */
export interface ExecuteAuth {
  /** Bearer <service_role key>: an internal edge caller — and every in-process caller, which already runs as the service role. */
  isServiceCaller: boolean;
  /** The verified user behind a JWT caller; null for the service caller. */
  gateUserId: string | null;
  /** has_role(gateUserId, 'admin') — resolved by the HTTP function, never by the body. */
  gateIsAdmin: boolean;
}

/** The HTTP status and JSON body the function would have answered with. */
export interface ExecuteOutcome {
  status: number;
  body: unknown;
}

/** The auth of a caller inside the same Deno project: the service role, as the HTTP hop with Bearer <service key> was. */
export const SERVICE_CALLER: ExecuteAuth = { isServiceCaller: true, gateUserId: null, gateIsAdmin: false };

/**
 * Runs one skill through the executor's pipeline. executeSkillRequest in
 * core.ts is the one implementation; a run's config carries it (ReasonConfig
 * .runSkill) so the pilot runs skills in-process without importing the core.
 */
export type SkillRunner = (body: ExecuteRequest, auth: ExecuteAuth) => Promise<ExecuteOutcome>;
