---
name: approval-engine-as-single-decision-source
description: Konsolidering — alla godkännanden (affärsobjekt + autonoma agent-skills) går genom samma approval_requests-motor. Spår A (agent-execute pending_approval) är nu en tunn adapter som anropar SECURITY DEFINER request_skill_approval och skapar en agent_skill-rad i approval_requests. Klienten pollar agent_activity.status för resume.
type: feature
---

# Approval Engine = enda beslutsmotorn

Tidigare hade FlowWink **två parallella godkännandespår**:

- **Spår A:** `agent-execute` → 202 `pending_approval` → `agent_activity` (skill-gating)
- **Spår B:** `approval_requests` + `approval_rules` + `evaluate_approval_required` (affärsobjekt)

Det skapade dubbel UX, dubbel audit och risk för drift när skills (t.ex. `place_order`, `ad_optimize`) börjar trigga affärsobjekt. Nu är **Spår B den enda beslutsmotorn**; Spår A är en tunn adapter.

## Flöde

1. MCP-klient anropar gated skill via `agent-execute`
2. `trust_level='approve'` + saknar `_approved=true` → `agent-execute`:
   a. Loggar pending-rad i `agent_activity` (status='pending_approval')
   b. Anropar `request_skill_approval(skill_name, skill_id, args, activity_id, agent, conversation_id, amount_cents, currency, reason)` SECURITY DEFINER RPC
   c. RPC kör `evaluate_approval_required('agent_skill', amount_cents, currency)` → matchar regel → skapar `approval_requests`-rad med `entity_type='agent_skill'`, `entity_id=activity_id`, `context.skill_name/args/agent`
   d. RPC patchar `agent_activity.approval_request_id`
3. Returnerar HTTP 202 med `{activity_id, approval_request_id}` + tipset att polla
4. Admin ser raden i `/admin/approvals` (samma vy som POs och expenses) — agent_skill-rader visar skill-namn, agent och args-preview
5. Admin klickar Approve → `resolve_approval` RPC → trigger `sync_agent_activity_on_approval` speglar status='approved' till `agent_activity`
6. **Klienten är ansvarig:** pollar `agent_activity` (eller `approval_requests`) på sitt activity_id, ser `status='approved'`, re-kallar samma skill med `_approved=true`. `agent-execute` ser bypass-flagga och kör handler

## Amount-extraktion

`agent-execute` plockar `amount_cents` från args i prioritetsordning:
1. `args.amount_cents`
2. `args.budget_cents`
3. `args.total_cents`

Så regler som "agent_skill med belopp över 5000 SEK kräver approver-roll" matchar automatiskt på t.ex. `ad_optimize` med `budget_cents` i args. Fortsätter följa "policy-spr\u00e5k = entity_type + amount" — ingen context-jsonpath-matchning än.

## Inga nya behörigheter

`approval_rules.required_role` styr vem som får godkänna. Default = admin. Skapa per-typ-regler i `/admin/approvals → Rules`. RLS på `approval_requests` är oförändrad.

## Filer

- Migration: skapar `agent_activity.approval_request_id`, `request_skill_approval()`, `sync_agent_activity_on_approval()` trigger
- `supabase/functions/agent-execute/index.ts` ~rad 142–190: anropar RPC + extraherar amount
- `src/pages/admin/ApprovalsPage.tsx`: agent_skill-cards visar skill-namn/agent/args; `agent_skill` valbart i regelformuläret
- `mem://architecture/agent-trust-and-gating-logic` (uppdaterad: trust_level='approve' = adapter mot approval_requests)

## OpenClaw-kompatibilitet (framtid)

Multi-channel-leverans (email-token, Slack, MCP-event så claws notifieras) är **inte byggt än** — explicit deferred per användarens beslut. Plattformen är källan, kanalerna är speglar. Public single-use approval-token-sida planeras separat.
