# FlowWork — the human surface on the agent substrate

*Established 2026-08-11. Implementation: `supabase/functions/workspace-chat/`,
`supabase/functions/_shared/skills/read-surface.ts`.*

## What FlowWork is

FlowWork (`/admin/flowwork`, edge function `workspace-chat`) is the
conversational surface where **employees** get answers across every module
instead of clicking through views and pulling reports. It is the third
consumer of the platform's one substrate:

| Consumer | Loop | Trust | Entry |
|---|---|---|---|
| FlowPilot | ReAct (`reason.ts`) | autonomy dial, staged writes | heartbeat / objectives |
| External agent | its own | MCP gateway `?mode=dispatch` | `mcp-server` |
| **FlowWork** | **bounded dispatch loop (max 4 rounds)** | **read-only, fail-closed** | authenticated chat |

The company's information is normalized into structured data by the modules;
skills make that data operable; all three consumers run on the same catalog.
That is the product's USP expressed as architecture.

## The decision: paired with the engine, not with FlowPilot

FlowWork has **no soul, no objectives, no autonomy**. It mounts the MCP
gateway's dispatch pattern *inside* the chat — `search_skills` (Skill
Relevance Engine) → `read_skill` → `execute_skill` (via `agent-execute`,
`agent_type: 'flowwork'`, `caller_user_id` set) — with zero HTTP/auth overhead
and with grounded context lanes an external operator does not get. "As capable
as an external agent" is therefore true by construction: same three tools,
closer to the data.

Skills are **pre-ranked per question** straight into the system prompt (the
same narrowing move FlowPilot's reason loop makes), so the model executes
directly instead of discovering the catalog one round-trip at a time.

## The boundary: the read surface

`_shared/skills/read-surface.ts`, fail-closed (same pattern as resumption's
`IDEMPOTENT_SKILLS`):

- read prefixes (`list_`, `get_`, `search_`, …) + explicit extras + a deny
  pattern (`api_key|secret|delete|…`) that overrides everything
- **`isReadCall(name, args)` judges the CALL**: `manage_*` skills pass only
  with an explicit read action (`list|get|search|view|check|status`) — a
  missing action fails closed; we do not bet on a handler's default branch
- writes are never executed: the model is instructed to *propose* the action
  and point to the admin page. Staged writes through `pending_operations` are
  the designed next step, not a gap.

Guardrails: `src/lib/__tests__/flowwork-read-surface.guardrails.test.ts`.

## Access model: RLS is the role linkage

Every context lane — chunks *and* the live entity lanes (contracts, CRM,
employees) — reads with the **caller's client**. A source the user's role may
not read is simply empty. No parallel role→source matrix exists or should be
built. (The live lanes ran on the service key until 2026-08-11 and showed
every employee full contract bodies and the HR register.)

Flowtable is the exception with its own gate: only `workspace_shared` bases.

## Sources

`documents, contracts, kb, pages, crm, employees, wiki, handbook, flowtable`
— defaults from `site_settings.cowork_chat`, per-user selection persisted in
the client. `handbook` is the customer's own `handbook_chapters` (indexed
since 2026-08-11), **not** `docs_pages`, which is FlowWink's repo
documentation (see task: exposure decision pending).

## Behavioural rules that exist because live smokes failed without them

Six live runs on the demo instance shaped the prompt + code; each lesson has a
structural backstop, not just prose:

1. model asked permission instead of looking things up → imperative rule
2. guessed skill names → "Skill not found" responses carry a search hint
3. guessed plurals (`manage_tickets`) → name resolution against the catalog
4. Swedish questions ranked wrong skills → Swedish business nouns in the
   shared `SYNONYM_MAP` (lifts FlowPilot and the gateway too)
5. confidently answered "no tickets" from the wrong module's result →
   honesty rule: absence may only be claimed from an empty result for the
   right entity
6. read `total_cents` as SEK → minor-units rule

The proof transcript (marquee question, correct amounts, cited) lives in
PR #195.
